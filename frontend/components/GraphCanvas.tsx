"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchTopology } from "@/lib/api";
import type { TopoNode, TopoNodeType } from "@/lib/types";
import Loader from "./ui/Loader";

const TYPE_STYLE: Record<TopoNodeType, { color: string; r: number; label: string }> = {
  device: { color: "var(--data-device)", r: 10, label: "Device" },
  vpa: { color: "var(--data-vpa)", r: 7.5, label: "VPA" },
  card: { color: "var(--data-card)", r: 7, label: "Card FP" },
  ip: { color: "var(--data-ip)", r: 6.5, label: "IP" },
  email: { color: "var(--data-email)", r: 6.5, label: "Email" },
  customer: { color: "var(--data-customer)", r: 5.5, label: "Customer" },
};

const W = 1200;
const H = 700;

function computeLayout(nodes: TopoNode[], edges: [string, string][]) {
  const pos = new Map<string, { x: number; y: number }>();
  const degree = new Map<string, number>();
  edges.forEach(([u, v]) => {
    degree.set(u, (degree.get(u) ?? 0) + 1);
    degree.set(v, (degree.get(v) ?? 0) + 1);
  });
  nodes.forEach((n) => { if (!degree.has(n.id)) degree.set(n.id, 0); });

  // Find hub (highest degree, prefer mule)
  const sorted = [...nodes].sort((a, b) => {
    const da = degree.get(a.id) ?? 0;
    const db = degree.get(b.id) ?? 0;
    if (a.mule !== b.mule) return a.mule ? -1 : 1;
    return db - da;
  });
  const hubId = sorted[0]?.id;
  const hubNeighbors = new Set<string>();
  edges.forEach(([u, v]) => {
    if (u === hubId) hubNeighbors.add(v);
    if (v === hubId) hubNeighbors.add(u);
  });

  // Initial placement: hub at center, its neighbors on ring, others on outer rings
  nodes.forEach((nd, i) => {
    if (nd.id === hubId) {
      pos.set(nd.id, { x: W / 2, y: H / 2 });
    } else if (hubNeighbors.has(nd.id)) {
      const idx = [...hubNeighbors].indexOf(nd.id);
      const total = hubNeighbors.size || 1;
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
      const rad = 140 + (i % 3) * 18 + Math.random() * 10;
      pos.set(nd.id, { x: W / 2 + rad * Math.cos(angle), y: H / 2 + rad * Math.sin(angle) });
    } else {
      const angle = Math.random() * Math.PI * 2;
      const rad = 240 + Math.random() * 180;
      pos.set(nd.id, { x: W / 2 + rad * Math.cos(angle), y: H / 2 + rad * Math.sin(angle) });
    }
  });

  const idx = new Map(nodes.map((nd, i) => [nd.id, i]));
  const iterations = nodes.length > 80 ? 320 : 260;
  for (let it = 0; it < iterations; it++) {
    const fx = new Float64Array(nodes.length);
    const fy = new Float64Array(nodes.length);
    // Repulsion: stronger for dense graphs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id)!;
        const b = pos.get(nodes[j].id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 9) { dx = 3; dy = (Math.random() - 0.5) * 2; d2 = 9; }
        const d = Math.sqrt(d2);
        const isHubPair = nodes[i].id === hubId || nodes[j].id === hubId;
        const repulse = isHubPair ? 1800 : 2800;
        const f = Math.min(repulse / d2, 3.2);
        fx[i] += (dx / d) * f; fy[i] += (dy / d) * f;
        fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f;
      }
    }
    // Attraction along edges
    for (const [u, v] of edges) {
      const ia = idx.get(u);
      const ib = idx.get(v);
      if (ia == null || ib == null) continue;
      const a = pos.get(u)!;
      const b = pos.get(v)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const ideal = u === hubId || v === hubId ? 110 : 70;
      const f = (d - ideal) * 0.045;
      fx[ia] += (dx / d) * f; fy[ia] += (dy / d) * f;
      fx[ib] -= (dx / d) * f; fy[ib] -= (dy / d) * f;
    }
    // Gentle center gravity + bounds
    for (let i = 0; i < nodes.length; i++) {
      const p = pos.get(nodes[i].id)!;
      const isHub = nodes[i].id === hubId;
      const g = isHub ? 0.02 : 0.006;
      fx[i] += (W / 2 - p.x) * g;
      fy[i] += (H / 2 - p.y) * g;
    }
    for (let i = 0; i < nodes.length; i++) {
      const p = pos.get(nodes[i].id)!;
      p.x += Math.max(-18, Math.min(18, fx[i]));
      p.y += Math.max(-18, Math.min(18, fy[i]));
      // Keep in bounds with padding
      p.x = Math.max(30, Math.min(W - 30, p.x));
      p.y = Math.max(30, Math.min(H - 30, p.y));
    }
  }
  return pos;
}

/** Industrial professional mule-ring graph canvas with zoom, pan, and node inspector. */
export default function GraphCanvas({ center, refreshToken }: { center?: string | null; refreshToken: number }) {
  const [data, setData] = useState<{ center?: string; nodes: TopoNode[]; edges: [string, string][] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });

  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    const cid = center && !center.includes(":") ? `device:${center}` : center ?? undefined;
    fetchTopology(cid)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => { alive = false; };
  }, [center, refreshToken, retryTick]);

  // Reset view on new data
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelected(null);
  }, [data?.center]);

  const layout = useMemo(() => (data && data.nodes.length > 0 ? computeLayout(data.nodes, data.edges) : null), [data]);
  const neighbors = useMemo(() => {
    if (!hover || !data) return null;
    const set = new Set<string>([hover]);
    data.edges.forEach(([u, v]) => { if (u === hover) set.add(v); if (v === hover) set.add(u); });
    return set;
  }, [hover, data]);

  const selectedNode = useMemo(() => data?.nodes.find((n) => n.id === selected) ?? null, [data, selected]);
  const selectedNeighbors = useMemo(() => {
    if (!selected || !data) return [];
    const neigh: TopoNode[] = [];
    data.edges.forEach(([u, v]) => {
      if (u === selected) { const n = data.nodes.find((x) => x.id === v); if (n) neigh.push(n); }
      if (v === selected) { const n = data.nodes.find((x) => x.id === u); if (n) neigh.push(n); }
    });
    return neigh;
  }, [selected, data]);

  const muleCount = data?.nodes.filter((n) => n.mule).length ?? 0;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.3, Math.min(4, z * delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: dragStart.panX + e.clientX - dragStart.x, y: dragStart.panY + e.clientY - dragStart.y });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);
  const zoomIn = useCallback(() => setZoom((z) => Math.min(4, z * 1.25)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(0.3, z * 0.8)), []);

  return (
    <section className="glass relative flex flex-col p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-sans text-[15px] font-semibold tracking-widest text-text-muted">MULE-RING GRAPH CANVAS</h2>
        {data && (
          <>
            <span className="chip px-3 py-1 font-mono text-xs">{data.nodes.length} nodes</span>
            <span className="chip px-3 py-1 font-mono text-xs">{data.edges.length} edges</span>
            {muleCount > 0 && (
              <span className="chip !border-danger/40 !bg-danger/10 px-3 py-1 font-mono text-xs text-danger">⬤ {muleCount} MULE NODES</span>
            )}
          </>
        )}
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <button onClick={zoomOut} className="chip !px-3 !py-1.5 text-sm font-medium hover:bg-bg-tertiary" aria-label="Zoom out">−</button>
          <span className="w-14 text-center font-mono text-xs font-medium text-text-muted">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} className="chip !px-3 !py-1.5 text-sm font-medium hover:bg-bg-tertiary" aria-label="Zoom in">+</button>
          <button onClick={resetView} className="chip !px-3 !py-1.5 font-mono text-xs font-medium hover:bg-bg-tertiary">RESET</button>
        </div>
        <span className="hidden font-mono text-xs text-text-muted lg:inline">NetworkX · radius 2 · drag to pan · scroll to zoom · click node for details</span>
      </div>

      <div className="relative overflow-hidden rounded-md border border-border bg-bg-primary/40" style={{ cursor: isDragging ? "grabbing" : "grab" }}>
        {error ? (
          <div className="flex h-[520px] flex-col items-center justify-center gap-3">
            <p className="font-mono text-xs text-danger">graph engine unreachable — {error}</p>
            <button onClick={() => setRetryTick((t) => t + 1)} className="chip font-mono !text-[10px] hover:bg-bg-tertiary">RETRY</button>
          </div>
        ) : !data ? (
          <div className="relative h-[520px]"><Loader center label="loading topology…" /></div>
        ) : !layout ? (
          <div className="flex h-[520px] items-center justify-center font-mono text-xs text-text-muted">no linkable entities yet — run an event to populate the graph</div>
        ) : (
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="h-[520px] w-full select-none"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--color-border)" strokeOpacity="0.08" strokeWidth="0.5" />
                  </pattern>
                  <filter id="muleGlow" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <filter id="nodeShadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" />
                  </filter>
                </defs>
                <rect width={W} height={H} fill="url(#grid)" />
                <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                  {data.edges.map(([u, v], i) => {
                    const pa = layout.get(u);
                    const pb = layout.get(v);
                    if (!pa || !pb) return null;
                    const hot = data.nodes.find((n) => n.id === u)?.mule || data.nodes.find((n) => n.id === v)?.mule;
                    const isSelectedEdge = selected && (u === selected || v === selected);
                    const dim = (hover && !(neighbors?.has(u) && neighbors?.has(v))) || (selected && !isSelectedEdge && selected !== u && selected !== v);
                    return (
                      <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                        stroke={isSelectedEdge ? "var(--color-accent)" : hot ? "var(--color-danger)" : "var(--color-border-strong)"}
                        strokeWidth={isSelectedEdge ? 2.2 : hot ? 1.8 : 1} opacity={dim ? 0.12 : hot ? 0.45 : 0.75}
                        strokeLinecap="round" />
                    );
                  })}
                  {data.nodes.map((n) => {
                    const p = layout.get(n.id);
                    if (!p) return null;
                    const st = TYPE_STYLE[n.type] ?? TYPE_STYLE.customer;
                    const isMule = n.mule;
                    const isHovered = n.id === hover;
                    const isSelected = n.id === selected;
                    const dim = (hover && !neighbors?.has(n.id) && n.id !== hover) || (selected && n.id !== selected && !selectedNeighbors.some((x) => x.id === n.id));
                    const showLabel = isSelected || isMule || n.id === hover || n.id === data.center || zoom > 1.4;
                    return (
                      <g key={n.id} opacity={dim ? 0.18 : 1}
                        onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                        onClick={() => setSelected(n.id)}
                        style={{ cursor: "pointer" }}>
                        {isMule && <circle cx={p.x} cy={p.y} r={st.r + 10} fill="var(--color-danger)" fillOpacity={0.10} />}
                        {isSelected && <circle cx={p.x} cy={p.y} r={st.r + 14} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="4 3" opacity={0.9} />}
                        <circle cx={p.x} cy={p.y} r={isSelected ? st.r + 1 : st.r}
                          fill={isMule ? "var(--data-mule)" : st.color}
                          fillOpacity={n.type === "ip" || n.type === "customer" ? 0.6 : 0.95}
                          stroke={isSelected ? "var(--color-accent)" : isMule ? "var(--data-mule)" : st.color}
                          strokeWidth={isSelected ? 2.6 : isHovered ? 2.2 : 1.2}
                          filter={isMule ? "url(#muleGlow)" : "url(#nodeShadow)"} />
                        {showLabel && (
                          <text x={p.x} y={p.y - st.r - 8} textAnchor="middle" fontSize={zoom > 1.2 ? 11 : 9.5}
                            fill={isMule ? "var(--data-mule)" : "var(--color-text-secondary)"} fontFamily="var(--font-mono)"
                            style={{ paintOrder: "stroke", stroke: "var(--color-bg-primary)", strokeWidth: 3, strokeOpacity: 0.85 }}>
                            {n.label.length > 20 ? n.label.slice(0, 19) + "…" : n.label}{isMule ? " ☠" : ""}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
            {selectedNode && (
              <div className="w-[320px] shrink-0 border-l border-border bg-bg-secondary/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-sans text-sm font-bold text-text-primary">Node Details</h3>
                  <button onClick={() => setSelected(null)} className="rounded p-1 text-text-muted hover:bg-bg-tertiary" aria-label="Close">✕</button>
                </div>
                <div className="space-y-3">
                  <div className="rounded-md border border-border bg-bg-primary/60 p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: TYPE_STYLE[selectedNode.type]?.color ?? "var(--color-text-muted)" }} />
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">{selectedNode.type}</span>
                      {selectedNode.mule && <span className="rounded bg-danger/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-danger">FLAGGED MULE</span>}
                    </div>
                    <p className="mt-2 font-mono text-sm font-semibold text-text-primary break-all">{selectedNode.label}</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-text-muted">{selectedNode.id}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-bg-tertiary/50 p-2.5">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Degree</p>
                      <p className="mt-1 font-mono text-lg font-bold text-text-primary">{data.edges.filter(([u, v]) => u === selected || v === selected).length}</p>
                    </div>
                    <div className="rounded-md bg-bg-tertiary/50 p-2.5">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Neighbors</p>
                      <p className="mt-1 font-mono text-lg font-bold text-text-primary">{selectedNeighbors.length}</p>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">Connected Entities</p>
                    <div className="max-h-[220px] overflow-y-auto rounded-md border border-border bg-bg-primary/40 p-2">
                      {selectedNeighbors.length === 0 ? (
                        <p className="font-mono text-xs text-text-muted">No connections</p>
                      ) : (
                        selectedNeighbors.map((nb) => (
                          <button key={nb.id} onClick={() => setSelected(nb.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-bg-tertiary">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TYPE_STYLE[nb.type]?.color ?? "var(--color-text-muted)" }} />
                            <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary">{nb.label}</span>
                            {nb.mule && <span className="h-1.5 w-1.5 rounded-full bg-danger" />}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="rounded-md bg-accent/10 p-2.5">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-accent">Industrial Insight</p>
                    <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                      {selectedNode.mule
                        ? "This entity is part of a high fan-out mule ring. Device fans out to multiple payment identities — investigate ledger and freeze payout."
                        : `Type ${selectedNode.type.toUpperCase()} — degree indicates linkage density. Use Re-center to pivot graph around this entity.`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {Object.entries(TYPE_STYLE).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-wide text-text-secondary">
            <span className="h-2 w-2 rounded-full" style={{ background: v.color }} />{v.label.toUpperCase()}
          </span>
        ))}
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] text-danger">
          <span className="h-2 w-2 rounded-full bg-danger shadow-accent" />FLAGGED MULE
        </span>
        <span className="ml-auto hidden font-mono text-[10px] text-text-muted lg:inline">Tip: Scroll to zoom · Drag to pan · Click node → inspect</span>
      </div>
    </section>
  );
}
