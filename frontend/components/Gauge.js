"use client";
import { fmt } from "@/lib/aq";
import { LevelChip } from "@/components/ui";

const EDGES = [0, 50, 100, 200, 300, 500];

/** Setengah lingkaran ISPU: 5 segmen sama lebar, penanda bergerak di dalam segmen levelnya. */
export default function Gauge({ value, level, label, caption }) {
  const cx = 115, cy = 112, r = 92;
  const pt = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const arc = (a0, a1) => {
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  let marker = null;
  if (value != null) {
    const v = Math.min(Math.max(value, 0), 500);
    let seg = EDGES.findIndex((e, i) => i < 5 && v <= EDGES[i + 1]);
    if (seg < 0) seg = 4;
    const frac = (v - EDGES[seg]) / (EDGES[seg + 1] - EDGES[seg]);
    const ang = Math.min(Math.max(180 + 36 * (seg + frac), 183), 357);
    marker = pt(ang);
  }
  return (
    <div className="gauge">
      <svg viewBox="0 0 230 132" width="230" height="132" role="img" aria-label={`ISPU PM2.5 ${value ?? "tidak ada data"}${label ? `, ${label}` : ""}`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={arc(180 + 36 * i + 1.6, 180 + 36 * (i + 1) - 1.6)} style={{ stroke: `var(--lv${i})`, fill: "none", strokeWidth: 13 }} />
        ))}
        {marker && <circle cx={marker[0]} cy={marker[1]} r="8.5" style={{ fill: "var(--ink)", stroke: "var(--surface)", strokeWidth: 3 }} />}
        <text x="115" y="100" textAnchor="middle" style={{ fill: "var(--ink)", fontSize: 38, fontWeight: 650, letterSpacing: "-0.02em" }}>
          {value == null ? "—" : fmt(value, 0)}
        </text>
        <text x="115" y="121" textAnchor="middle" style={{ fill: "var(--ink-2)", fontSize: 12 }}>
          ISPU PM2.5
        </text>
      </svg>
      <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
        <LevelChip level={level} label={label} />
        {caption && <span className="note">{caption}</span>}
      </div>
    </div>
  );
}
