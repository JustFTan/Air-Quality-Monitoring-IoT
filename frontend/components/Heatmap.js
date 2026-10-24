"use client";
import { useMemo, useState } from "react";
import { fmt, fmtDM, toMs, PARAM_COLOR } from "@/lib/aq";

/**
 * Peta panas jam x hari. values: Map "YYYY-MM-DD HH" -> { v, n }.
 * Satu warna (warna parameter) dari terang ke gelap: makin pekat makin tinggi.
 */
export default function Heatmap({ values, days, param, cfg }) {
  const [hot, setHot] = useState(null);
  const meta = cfg.params[param];

  const [lo, hi] = useMemo(() => {
    const nums = [...values.values()].map((x) => x.v).filter((v) => v != null);
    return nums.length ? [Math.min(...nums), Math.max(...nums)] : [0, 1];
  }, [values]);

  const pct = (v) => 12 + 88 * ((v - lo) / (hi - lo || 1));
  const h = hot ? values.get(hot.key) : null;

  return (
    <div>
      <div className="hm" onPointerLeave={() => setHot(null)} style={{ "--k": PARAM_COLOR[param] }}>
        <span />
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} className="hl" aria-hidden="true">{i % 3 === 0 ? String(i).padStart(2, "0") : ""}</span>
        ))}
        {days.map((day) => (
          <HeatRow key={day} day={day} values={values} pct={pct} hot={hot} setHot={setHot} />
        ))}
      </div>
      <div className="row" style={{ marginTop: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div className="ribbon-hint" style={{ margin: 0 }}>
          {hot ? (
            h?.v != null ? (
              <span>
                <b>{fmtDM(toMs(`${hot.day} 00:00:00`))} pukul {hot.hh}:00</b> · {meta.label} {fmt(h.v, meta.digits)} {meta.unit}
                {h.n != null && <span className="muted"> · {h.n} data</span>}
              </span>
            ) : (
              <span className="muted">{fmtDM(toMs(`${hot.day} 00:00:00`))} pukul {hot.hh}:00 · tidak ada data</span>
            )
          ) : (
            <span className="muted">Arahkan kursor ke sel untuk melihat nilai per jam.</span>
          )}
        </div>
        <div className="scale" style={{ "--k": PARAM_COLOR[param] }}>
          {fmt(lo, meta.digits)}
          <i />
          {fmt(hi, meta.digits)} {meta.unit}
        </div>
      </div>
    </div>
  );
}

function HeatRow({ day, values, pct, hot, setHot }) {
  return (
    <>
      <span className="lab">{fmtDM(toMs(`${day} 00:00:00`))}</span>
      {Array.from({ length: 24 }, (_, i) => {
        const hh = String(i).padStart(2, "0");
        const key = `${day} ${hh}`;
        const cell = values.get(key);
        const has = cell && cell.v != null;
        return (
          <span
            key={key}
            className={`c${has ? "" : " none"}${hot?.key === key ? " hot" : ""}`}
            style={has ? { "--p": `${pct(cell.v).toFixed(1)}%` } : undefined}
            onPointerEnter={() => setHot({ key, day, hh })}
          />
        );
      })}
    </>
  );
}
