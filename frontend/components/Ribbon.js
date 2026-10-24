"use client";
import { useState } from "react";
import { fmt, levelLabel } from "@/lib/aq";
import { LevelChip, StatusShape } from "@/components/ui";

/** Jalur 24 jam: satu sel = 15 menit, warna = kondisi terburuk di antara empat parameter. */
export default function Ribbon({ cells, cfg }) {
  const [hot, setHot] = useState(null);
  if (!cells?.length) return null;

  const withData = cells.filter((c) => c.level != null);
  const share = [0, 1, 2, 3, 4].map((l) => ({
    level: l,
    pct: withData.length ? Math.round((100 * withData.filter((c) => c.level === l).length) / withData.length) : 0,
  }));
  const summary = share.filter((s) => s.pct > 0).map((s) => `${cfg.levels[s.level].label} ${s.pct}%`).join(", ");
  const axisIdx = [0, 24, 48, 72, 95];
  const c = hot != null ? cells[hot] : null;
  const meta = c?.worst ? cfg.params[c.worst] : null;

  return (
    <div className="ribbon-wrap">
      <div className="ribbon" role="img" aria-label={`Kondisi 24 jam terakhir: ${summary || "tidak ada data"}`} onPointerLeave={() => setHot(null)}>
        {cells.map((cell, i) => (
          <i
            key={cell.t}
            className={`${cell.level == null ? "none" : ""}${hot === i ? " hot" : ""}`}
            style={cell.level != null ? { "--k": `var(--lv${cell.level})` } : undefined}
            onPointerEnter={() => setHot(i)}
          />
        ))}
      </div>
      <div className="ribbon-axis" aria-hidden="true">
        {axisIdx.map((i) => (
          <span key={i}>{cells[i].t.slice(11, 16)}</span>
        ))}
      </div>
      <div className="ribbon-hint" aria-live="off">
        {c ? (
          <span className="row" style={{ flexWrap: "wrap" }}>
            <b className="num">{c.t.slice(11, 16)}</b>
            {c.level != null ? (
              <>
                <LevelChip level={c.level} label={levelLabel(cfg, c.worst, c.level)} />
                <span className="muted">
                  {meta.label} {fmt(c.v[c.worst], meta.digits)} {meta.unit} · rata-rata 15 menit dari {c.n} data
                </span>
              </>
            ) : (
              <span className="muted">Tidak ada data masuk pada 15 menit ini</span>
            )}
          </span>
        ) : (
          <span className="muted">Arahkan kursor ke jalur untuk melihat kondisi tiap 15 menit.</span>
        )}
      </div>
      <div className="ribbon-legend">
        {share.map((s) => (
          <span key={s.level}>
            <StatusShape level={s.level} size={11} />
            {cfg.levels[s.level].label} <b className="num" style={{ color: "var(--ink)" }}>{s.pct}%</b>
          </span>
        ))}
        <span>
          <i style={{ width: 11, height: 11, borderRadius: 2, background: "var(--grid)", display: "inline-block" }} />
          Tidak ada data
        </span>
      </div>
    </div>
  );
}
