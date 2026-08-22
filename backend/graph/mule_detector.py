"""Entity-linkage mule-ring detector on a NetworkX in-memory graph.

Entities: devices, VPAs, card fingerprints, IPs, emails, customers.
A "mule ring" = one device (or IP) fanning out to many payment identities,
or a dense component exhibiting fan-in/fan-out asymmetry.

Optionally mirrors writes to Neo4j when TRACER_NEO4J_URI is configured.
"""
from __future__ import annotations

import math
import threading
from typing import Any

import networkx as nx

from backend.schemas import GraphEvidence, TransactionEvent

_MAX_SNAPSHOT_NODES = 120


class MuleDetector:
    def __init__(self) -> None:
        self.g: nx.Graph = nx.Graph()
        self._lock = threading.RLock()
        self._last_entities: list[str] = []
        self._seed_history()

    # ------------------------------------------------------------------ seed
    def _add(self, kind: str, value: str, **attrs: Any) -> str:
        node_id = f"{kind}:{value}"
        if not self.g.has_node(node_id):
            self.g.add_node(node_id, type=kind, label=value, **attrs)
        return node_id

    def _link(self, a: str, b: str, weight: int = 1) -> None:
        if self.g.has_edge(a, b):
            self.g[a][b]["weight"] += weight
        else:
            self.g.add_edge(a, b, weight=weight)

    def _seed_history(self) -> None:
        """Deterministic historical graph so demos show rich topology."""
        # --- planted mule ring: 1 device -> 14 VPAs, 3 shared cards, 1 IP ---
        dev = self._add("device", "DEV-MULE-RING-01")
        ip = self._add("ip", "203.0.113.7")
        self._link(dev, ip)
        cards = [self._add("card", f"FP-MULE-{i}") for i in (1, 2, 3)]
        for c in cards:
            self._link(dev, c)
        for i in range(1, 15):
            vpa = self._add("vpa", f"fraudvpa{i:02d}@ybl")
            cust = self._add("customer", f"CUST-MULE-{i:02d}")
            email = self._add("email", f"burner{i:02d}@mailinator.com")
            self._link(dev, vpa)
            self._link(vpa, cust)
            self._link(vpa, email)
            self._link(cards[i % 3], vpa)

        # --- benign singletons -------------------------------------------
        for name, vpa, email in (("alice", "alice@oksbi", "alice@gmail.com"),
                                 ("bob", "bob@ybl", "bob@yahoo.com")):
            d = self._add("device", f"DEV-OK-{name.upper()}")
            v = self._add("vpa", vpa)
            e = self._add("email", email)
            c = self._add("customer", f"CUST-OK-{name.upper()}")
            cd = self._add("card", f"FP-OK-{name.upper()}")
            i = self._add("ip", f"49.36.{hash(name) % 250}.{(hash(name) * 7) % 250}")
            for pair in ((d, v), (d, cd), (d, i), (v, e), (v, c)):
                self._link(*pair)

        # --- benign family cluster: 1 device -> 3 VPAs (not a ring) -------
        d = self._add("device", "DEV-FAM-01")
        i = self._add("ip", "106.51.77.12")
        self._link(d, i)
        for k in (1, 2, 3):
            v = self._add("vpa", f"fam.member{k}@paytm")
            self._link(d, v)
            self._link(v, self._add("customer", f"CUST-FAM-{k}"))

    # ------------------------------------------------------------- ingestion
    def observe(self, ev: TransactionEvent) -> tuple[GraphEvidence, dict[str, Any]]:
        """Ingest event entities then analyze; returns evidence + stats."""
        with self._lock:
            touched = self._ingest(ev)
            primary = next((n for n in touched if n.startswith("dev:")), None) \
                or (touched[0] if touched else None)
            if primary is None:
                empty = GraphEvidence(summary="no linkable entities")
                return empty, {"device_fan_out": 1, "vpa_degree": 1,
                               "card_share": 0, "ip_crowding": 0,
                               "mule_ring_score": 0, "component_size": 1}
            comp = nx.node_connected_component(self.g, primary)
            fan_vpas = self._fan_out(primary)
            # Only payment identities (VPAs/cards) count toward ring mass —
            # customers/emails/IPs inflate component size and would make a
            # 3-VPA household look like a mule ring (see test_graph_generalization).
            identity_mass = sum(
                1 for n in comp if self.g.nodes[n].get("type") in ("vpa", "card"))
            ring = fan_vpas >= 4 or (fan_vpas >= 3 and identity_mass >= 8)
            conf = min(0.98, 1.0 - math.exp(-max(fan_vpas - 1, 0) / 6.0))
            if ring:
                conf = max(conf, 0.72)
            score = int(round(conf * 100)) if ring else min(25, len(comp) * 2)

            mule_nodes: list[str] = []
            if ring:
                for node in comp:
                    if self.g.nodes[node].get("type") == "device" and self._fan_out(node) >= 4:
                        for nb in self.g.neighbors(node):
                            if self.g.nodes[nb].get("type") == "vpa":
                                self.g.nodes[nb]["mule"] = True
                                mule_nodes.append(nb)

            dev_node = next((n for n in touched if n.startswith("dev:")), None)
            vpa_node = next((n for n in touched if n.startswith("vpa:")), None)
            card_node = next((n for n in touched if n.startswith("fp:")), None)
            ip_node = next((n for n in touched if n.startswith("ip:")), None)
            stats = {
                "device_fan_out": self._fan_out(dev_node or primary),
                "vpa_degree": self.g.degree(vpa_node) if vpa_node else 0,
                "card_share": max(self.g.degree(card_node) - 1, 0) if card_node else 0,
                "ip_crowding": sum(
                    1 for n in self.g.neighbors(ip_node)
                    if self.g.nodes[n].get("type") == "device") if ip_node else 0,
                "mule_ring_score": score,
                "component_size": len(comp),
            }
            summary = (
                f"Mule ring detected — device fans out to {fan_vpas} payment identities "
                f"(component of {len(comp)} entities, confidence {conf:.0%})"
                if ring else
                f"No ring — {len(comp)} linked entities, fan-out {fan_vpas}, confidence {conf:.0%}"
            )
            evidence = GraphEvidence(
                component_size=len(comp),
                mule_nodes=mule_nodes[:20],
                shared_device_vpas=fan_vpas,
                ring_detected=ring,
                ring_confidence=round(conf, 2),
                summary=summary,
            )
            self._last_entities = touched
            self._cached_score = score
            self._mirror_neo4j(ev, score)
            return evidence, stats

    def _ingest(self, ev: TransactionEvent) -> list[str]:
        nodes: list[str] = []
        dev = vpa = card = ip = email = None
        if ev.context.device_id:
            dev = self._add("device", ev.context.device_id)
            nodes.append(dev)
        if ev.instrument.vpa:
            vpa = self._add("vpa", ev.instrument.vpa)
            nodes.append(vpa)
        if ev.instrument.card_fingerprint:
            card = self._add("card", ev.instrument.card_fingerprint)
            nodes.append(card)
        if ev.context.ip:
            ip = self._add("ip", ev.context.ip)
            nodes.append(ip)
        if ev.context.email:
            email = self._add("email", ev.context.email)
            nodes.append(email)
        cust = self._add("customer", ev.customer.id)
        nodes.append(cust)
        if dev and vpa:
            self._link(dev, vpa)
        if dev and card:
            self._link(dev, card)
        if dev and ip:
            self._link(dev, ip)
        if vpa and email:
            self._link(vpa, email)
        if vpa and cust:
            self._link(vpa, cust)
        return nodes

    def _fan_out(self, node: str) -> int:
        try:
            return sum(1 for nb in self.g.neighbors(node)
                       if self.g.nodes[nb].get("type") in ("vpa", "card"))
        except KeyError:
            return 0

    def _mirror_neo4j(self, ev: TransactionEvent, score: int) -> None:
        from backend.config import NEO4J_URI

        if not NEO4J_URI:
            return
        try:                                   # optional dependency, best effort
            from neo4j import GraphDatabase

            if getattr(self, "_neo4j_session", None) is None:
                driver = GraphDatabase.driver(NEO4J_URI)
                driver.verify_connectivity()
                self._neo4j_session = driver.session()
            q = ("MERGE (e:Event {id:$eid}) SET e.score=$score "
                 "WITH e UNWIND $nodes AS nid MATCH (n {id:nid}) MERGE (e)-[:LINKED]->(n)")
            self._neo4j_session.run(q, eid=ev.event_id, score=score,
                                    nodes=list(self._last_entities))
        except Exception:
            pass                               # Neo4j down must never break the SLA

    # ------------------------------------------------------------- UI canvas
    def topology(self, center: str | None = None) -> dict[str, Any]:
        with self._lock:
            src = center
            if src and not self.g.has_node(src):
                src = None
            if src is None:
                candidates = self._last_entities or list(self.g.nodes)
                src = next((n for n in candidates
                            if self.g.has_node(n) and self.g.degree(n) >= 3), None)
                if src is None and candidates:
                    src = next(n for n in candidates if self.g.has_node(n))
            if src is None:
                return {"nodes": [], "edges": []}

            lengths = nx.single_source_shortest_path_length(self.g, src, cutoff=2)
            keep = sorted(lengths, key=lambda n: lengths[n])[:_MAX_SNAPSHOT_NODES]
            sub = self.g.subgraph(keep)
            nodes = [{
                "id": n,
                "type": data.get("type", "?"),
                "label": data.get("label", n),
                "mule": bool(data.get("mule")),
            } for n, data in ((n, self.g.nodes[n]) for n in sub.nodes)]
            edges = [[u, v] for u, v in sub.edges()]
            return {"center": src, "nodes": nodes, "edges": edges}


_detector: MuleDetector | None = None


def get_detector() -> MuleDetector:
    global _detector
    if _detector is None:
        _detector = MuleDetector()
    return _detector
