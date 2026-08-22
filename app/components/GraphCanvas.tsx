"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchTopology } from "@/lib/api";

type TopoNode = { id: string; type: string; label: string; mule: boolean };
type TopoData = { center?: string; nodes: TopoNode[]; edges: [string, string][] };

const TYPE_STYLE: Record<string, { color: string; r: number; label: string }> = {
  device: { color: "#a855f7", r: 9.5, label: "Device" },
  vpa: { color: "#00d4aa", r: 7, label: "VPA" },
  card: { color: "#60a5fa", r: 6.5, label: "Card FP" },
  ip: { color: "#94a3b8", r: 6, label: "IP" },
  email: { color: "#f97316", r: 6, label: "Email" },
  customer: { color: "#64748b", r: 5, label: "Customer" },
};

const W = 860;
const H = 540;

function computeLayout(nodes: TopoNode[], edges: [string, string][]) {
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((nd, i) => {
    const angle = i * 2.39996;
    const rad = 24 * Math.sqrt(i);
    pos.set(nd.id, { x: W / 2 + rad * Math.cos(angle) * 1.45, y: H / 2 + rad * Math.sin(angle) * 1.05 });
  });
  const idx = new Map(nodes.map((nd, i) => [nd.id, i]));
  for (let it = 0; it < 260; it++) {
    const fx = new Float64Array(nodes.length);
    const fy = new Float64Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id)!;
        const b = pos.get(nodes[j].id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 4) { dx = 2; dy = 0; d2 = 4; }
        const d = Math.sqrt(d2);
        const f = Math.min(1600 / d2, 2.6);
        fx[i] += (dx / d) * f; fy[i] += (dy / d) * f;
        fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f;
      }
    }
    for (const [u, v] of edges) {
      const ia = idx.get(u);
      const ib = idx.get(v);
      if (ia == null || ib == null) continue;
      const a = pos.get(u)!;
      const b = pos.get(v)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 62) * 0.05;
      fx[ia] += (dx / d) * f; fy[ia] += (dy / d) * f;
      fx[ib] -= (dx / d) * f; fy[ib] -= (dy / d) * f;
    }
    for (let i = 0; i < nodes.length; i++) {
      const p = pos.get(nodes[i].id)!;
      fx[i] += (W / 2 - p.x) * 0.012;
      fy[i] += (H / 2 - p.y) * 0.012;
    }
    for (let i = 0; i < nodes.length; i++) {
      const p = pos.get(nodes[i].id)!;
      p.x += Math.max(-15, Math.min(15, fx[i]));
      p.y += Math.max(-15, Math.min(15, fy[i]));
    }
  }
  return pos;
}

export default function GraphCanvas({
  center,
  refreshToken,
}: {
  center?: string | null;
  refreshToken: number;
}) {
  const [data, setData] = useState<TopoData | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const cid = center && !center.includes(":") ? `dev:${center}` : center ?? undefined;
    fetchTopology(cid)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({ nodes: [], edges: [] }));
    return () => {
      alive = false;
    };
  }, [center, refreshToken]);

  const layout = useMemo(
    () => (data && data.nodes.length > 0 ? computeLayout(data.nodes, data.edges) : null),
    [data]
  );

  const neighbors = useMemo(() => {
    if (!hover || !data) return null;
    const set = new Set<string>([hover]);
    data.edges.forEach(([u, v]) => {
      if (u === hover) set.add(v);
      if (v === hover) set.add(u);
    });
    return set;
  }, [hover, data]);

  const muleCount = data?.nodes.filter((n) => n.mule).length ?? 0;

  return (
    <section className="glass relative flex flex-col p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-grotesk text-sm font-semibold tracking-widest text-white/50">
          MULE-RING GRAPH CANVAS
        </h2>
        {data && (
          <>
            <span className="chip font-mono text-[10px]">{data.nodes.length} nodes</span>
            <span className="chip font-mono text-[10px]">{data.edges.length} edges</span>
            {muleCount > 0 && (
              <span className="chip !border-danger/40 !bg-danger/10 font-mono text-[10px] text-danger">
                ⬤ {muleCount} MULE NODES
              </span>
            )}
          </>
        )}
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-white/30">NetworkX topology · radius 2 ego-graph</span>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-line bg-black/40">
        {!layout ? (
          <div className="flex h-[420px] items-center justify-center font-mono text-xs text-white/30">
            loading topology…
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="h-[420px] w-full">
            <defs>
              <filter id="muleGlow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {data!.edges.map(([u, v], i) => {
              const pa = layout.get(u);
              const pb = layout.get(v);
              if (!pa || !pb) return null;
              const hot =
                data!.nodes.find((n) => n.id === u)?.mule ||
                data!.nodes.find((n) => n.id === v)?.mule;
              const dim = neighbors && !(neighbors.has(u) && neighbors.has(v));
              return (
                <line
                  key={i}
                  x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                  stroke={hot ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.10)"}
                  strokeWidth={hot ? 1.6 : 1}
                  opacity={dim ? 0.15 : 1}
                />
              );
            })}

            {data!.nodes.map((n) => {
              const p = layout.get(n.id);
              if (!p) return null;
              const st = TYPE_STYLE[n.type] ?? TYPE_STYLE.customer;
              const isMule = n.mule;
              const dim = neighbors && !neighbors.has(n.id);
              const showLabel = n.id === data!.center || isMule || n.id === hover ||
                (neighbors?.has(n.id) ?? false);
              return (
                <g
                  key={n.id}
                  opacity={dim ? 0.22 : 1}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer" }}
                >
                  <title>{`${n.type.toUpperCase()} · ${n.label}${isMule ? " · FLAGGED MULE" : ""}`}</title>
                  {isMule && (
                    <circle cx={p.x} cy={p.y} r={st.r + 7} fill="rgba(239,68,68,0.12)" />
                  )}
                  <circle
                    cx={p.x} cy={p.y} r={st.r}
                    fill={isMule ? "#ef4444" : st.color}
                    fillOpacity={n.type === "ip" || n.type === "customer" ? 0.55 : 0.92}
                    stroke={isMule ? "#fca5a5" : `${st.color}`}
                    strokeWidth={n.id === hover ? 2.4 : 1.1}
                    filter={isMule ? "url(#muleGlow)" : undefined}
                  />
                  {showLabel && (
                    <text
                      x={p.x} y={p.y - st.r - 6}
                      textAnchor="middle"
                      fontSize="9.5"
                      fill={isMule ? "#fca5a5" : "rgba(255,255,255,0.65)"}
                      fontFamily="'JetBrains Mono', monospace"
                    >
                      {n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}
                      {isMule ? " ☠" : ""}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {Object.entries(TYPE_STYLE).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-wide text-white/45">
            <span className="h-2 w-2 rounded-full" style={{ background: v.color }} />
            {v.label.toUpperCase()}
          </span>
        ))}
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] text-danger">
          <span className="h-2 w-2 rounded-full bg-danger shadow-[0_0_8px_#ef4444]" />
          FLAGGED MULE
        </span>
      </div>
    </section>
  );
}
