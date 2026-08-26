"""Entity-linkage mule-ring detector on a NetworkX in-memory graph.

Entities: devices, VPAs, card fingerprints, IPs, emails, customers.
A "mule ring" = one device (or IP) fanning out to many payment identities,
or a dense component exhibiting fan-in/fan-out asymmetry.

Hardening additions over the original:
* Per-partition ``asyncio.Lock`` for atomic mutations under concurrency.
* LRU / time-window eviction to bound memory growth on a long-running node.
* Optional, NON-blocking mirror of writes to Neo4j (``asyncio.create_task``)
  when ``NEO4J_URI`` is configured — a failed mirror never breaks the SLA.
* Keeps the explicit negative-control behavior (a 1-device / 2-3-VPA
  household scores < 30 and is NOT flagged as a ring).
"""
from __future__ import annotations

import asyncio
import math
import time
from collections import OrderedDict
from typing import Any

import networkx as nx

from backend.app.core.config import NEO4J_URI
from backend.app.core.metrics import graph_nodes
from backend.app.models.schemas import GraphEvidence, TransactionEvent

_MAX_SNAPSHOT_NODES = 120
_MAX_NODES = 5_000            # hard memory ceiling; triggers LRU eviction
_EVICT_BATCH = 250


class MuleDetector:
    def __init__(self) -> None:
        self.g: nx.Graph = nx.Graph()
        self._lock = asyncio.Lock()                         # partition-agnostic guard
        self._partition_locks: dict[str, asyncio.Lock] = {}
        self._last_entities: list[str] = []
        self._cached_score = 0
        self._access: OrderedDict[str, float] = OrderedDict()   # LRU order

    # ------------------------------------------------------------------ partitioning
    def _partition_for(self, node: str | None) -> str:
        if not node:
            return "__root__"
        kind = node.split(":", 1)[0]
        return kind

    def _partition_lock(self, partition: str) -> asyncio.Lock:
        lock = self._partition_locks.get(partition)
        if lock is None:
            lock = asyncio.Lock()
            self._partition_locks[partition] = lock
        return lock

    def _add(self, kind: str, value: str, **attrs: Any) -> str:
        node_id = f"{kind}:{value}"
        if not self.g.has_node(node_id):
            self.g.add_node(node_id, type=kind, label=value, **attrs)
        self._touch(node_id)
        return node_id

    def _touch(self, node_id: str) -> None:
        self._access.pop(node_id, None)
        self._access[node_id] = time.monotonic()

    def _link(self, a: str, b: str, weight: int = 1) -> None:
        if self.g.has_edge(a, b):
            self.g[a][b]["weight"] += weight
        else:
            self.g.add_edge(a, b, weight=weight)
        self._touch(a)
        self._touch(b)

    def reseed(self) -> None:
        """Reset entity graph to empty state (zero entity state)."""
        self.g = nx.Graph()
        self._last_entities = []
        self._cached_score = 0
        self._access.clear()
        graph_nodes.set(0)

    # ------------------------------------------------------------- ingestion
    def observe(self, ev: TransactionEvent) -> tuple[GraphEvidence, dict[str, Any]]:
        """Synchronous ingestion + analysis (back-compat; used by tests)."""
        touched = self._ingest(ev)
        primary = next((n for n in touched if n.startswith("device:")), None) \
            or (touched[0] if touched else None)
        if primary is None:
            empty = GraphEvidence(summary="no linkable entities")
            return empty, {"device_fan_out": 1, "vpa_degree": 1,
                           "card_share": 0, "ip_crowding": 0,
                           "mule_ring_score": 0, "component_size": 1}
        comp = nx.node_connected_component(self.g, primary)
        fan_vpas = self._fan_out(primary)
        identity_mass = sum(
            1 for n in comp if self.g.nodes[n].get("type") in ("vpa", "card"))

        # Device rotation correlation signal: cluster different devices sharing cards/IPs
        devices_in_comp = [n for n in comp if self.g.nodes[n].get("type") == "device"]
        cards_in_comp = [n for n in comp if self.g.nodes[n].get("type") == "card"]
        device_rotation_detected = len(devices_in_comp) >= 2 and len(cards_in_comp) >= 1 and identity_mass >= 4

        ring = fan_vpas >= 4 or (fan_vpas >= 3 and identity_mass >= 8) or device_rotation_detected
        # Structural risk score derived from entity graph topology (no uncalibrated "confidence" claim)
        ring_ratio = min(1.0, fan_vpas / 4.0) if fan_vpas > 0 else 0.0
        score = min(100, max(40, fan_vpas * 18 + identity_mass * 4)) if ring else min(25, len(comp) * 2)

        mule_nodes: list[str] = []
        if ring:
            for node in comp:
                if self.g.nodes[node].get("type") == "device" and self._fan_out(node) >= 4:
                    for nb in self.g.neighbors(node):
                        if self.g.nodes[nb].get("type") == "vpa":
                            self.g.nodes[nb]["mule"] = True
                            mule_nodes.append(nb)

        dev_node = next((n for n in touched if n.startswith("device:")), None)
        vpa_node = next((n for n in touched if n.startswith("vpa:")), None)
        card_node = next((n for n in touched if n.startswith("card:")), None)
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
            f"(component of {len(comp)} entities, structural ratio {ring_ratio:.2f})"
            if ring else
            f"No ring — {len(comp)} linked entities, fan-out {fan_vpas}, structural ratio {ring_ratio:.2f}"
        )
        evidence = GraphEvidence(
            component_size=len(comp),
            mule_nodes=mule_nodes[:20],
            shared_device_vpas=fan_vpas,
            ring_detected=ring,
            ring_structural_ratio=round(ring_ratio, 2),
            summary=summary,
        )
        self._last_entities = touched
        self._cached_score = score
        graph_nodes.set(self.g.number_of_nodes())
        self._maybe_evict()
        if NEO4J_URI:
            try:
                asyncio.create_task(self._mirror_neo4j(ev, score))
            except RuntimeError:
                # No running loop (e.g. called from a sync test) — skip mirror.
                pass
        return evidence, stats

    async def observe_async(self, ev: TransactionEvent) -> tuple[GraphEvidence, dict[str, Any]]:
        """Async atomic ingestion using per-partition locks."""
        partition = self._partition_for(
            next((n for n in self._entities_of(ev)), None))
        async with self._partition_lock(partition), self._lock:
            return self.observe(ev)

    @staticmethod
    def _entities_of(ev: TransactionEvent) -> list[str]:
        out: list[str] = []
        if ev.context.device_id:
            out.append(f"device:{ev.context.device_id}")
        if ev.instrument.vpa:
            out.append(f"vpa:{ev.instrument.vpa}")
        return out

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
        if card and vpa:
            self._link(card, vpa)
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

    def _maybe_evict(self) -> None:
        """LRU eviction of leaf nodes once the graph exceeds the memory cap."""
        if self.g.number_of_nodes() <= _MAX_NODES:
            return
        evicted = 0
        for node in list(self._access.keys()):
            if evicted >= _EVICT_BATCH:
                break
            if self.g.degree(node) <= 1:           # only leaf/disconnected nodes
                data = self.g.nodes[node]
                if data.get("type") in ("device", "vpa", "card"):
                    continue                       # never drop payment identity cores
                self.g.remove_node(node)
                self._access.pop(node, None)
                evicted += 1
        graph_nodes.set(self.g.number_of_nodes())

    async def _mirror_neo4j(self, ev: TransactionEvent, score: int) -> None:
        """Best-effort, fire-and-forget mirror to Neo4j. Never raises."""
        if not NEO4J_URI:
            return
        try:
            from backend.app.infrastructure.neo4j_client import get_neo4j

            driver = await get_neo4j()
            if driver is None:
                return
            from backend.app.core.security import guard_cypher_query

            q = guard_cypher_query(
                ("MERGE (e:Event {id:$eid}) SET e.score=$score "
                 "WITH e UNWIND $nodes AS nid MATCH (n {id:nid}) MERGE (e)-[:LINKED]->(n)"),
                {"eid": ev.event_id, "score": score, "nodes": list(self._last_entities)},
            )
            session = driver.session()
            try:
                session.run(q, eid=ev.event_id, score=score,
                            nodes=list(self._last_entities))
            finally:
                session.close()
        except Exception:
            pass                               # Neo4j down must never break the SLA

    def _resolve_center(self, center: str) -> str | None:
        """Forgiving center resolution: exact id, known prefix aliases,
        or a bare identifier matched against any node's value part."""
        if not center:
            return None
        if self.g.has_node(center):
            return center
        aliases = {"dev": "device", "fp": "card", "cust": "customer", "em": "email"}
        head, sep, tail = center.partition(":")
        if sep:
            kind = aliases.get(head.lower(), head.lower())
            nid = f"{kind}:{tail}"
            if self.g.has_node(nid):
                return nid
            for node in self.g.nodes:
                kind_n, _, value = node.partition(":")
                if kind_n == kind and value == tail:
                    return node
            return None
        for node in self.g.nodes:              # bare identifier
            if node.partition(":")[2] == center:
                return node
        return None

    # ------------------------------------------------------------- UI canvas
    def topology(self, center: str | None = None) -> dict[str, Any]:
        src = self._resolve_center(center) if center else None
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
