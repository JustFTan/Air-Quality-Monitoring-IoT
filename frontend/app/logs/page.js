"use client";
import { Fragment, useEffect, useState } from "react";
import { useApp } from "@/components/AppContext";
import { useApi } from "@/lib/api";
import { LOG_SHAPE, eventLabel, fmt } from "@/lib/aq";
import { Empty, Segmented, StatusShape } from "@/components/ui";
import Icon from "@/components/Icon";

const LEVELS = ["INFO", "WARN", "ERROR"];
const LEVEL_TEXT = { INFO: "Info", WARN: "Peringatan", ERROR: "Error" };
const RANGES = [
  { value: "1", label: "1 jam" },
  { value: "6", label: "6 jam" },
  { value: "24", label: "24 jam" },
  { value: "168", label: "7 hari" },
  { value: "0", label: "Semua" },
];
const SIZE = 100;

function pretty(payload) {
  if (!payload) return null;
  try { return JSON.stringify(JSON.parse(payload), null, 2); } catch { return payload; }
}

function useDebounced(v, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

export default function Logs() {
  const { cfg, device, devicesLoading, poll, auto } = useApp();
  const [levels, setLevels] = useState(["INFO", "WARN", "ERROR"]);
  const [event, setEvent] = useState("");
  const [text, setText] = useState("");
  const [hours, setHours] = useState("24");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(null);
  const qtext = useDebounced(text);

  const q = useApi(
    "/api/logs",
    {
      device, event, q: qtext, hours: hours === "0" ? "" : hours,
      level: levels.length === 3 ? "" : levels.join(",") || "NONE",
      limit: SIZE, offset: page * SIZE,
    },
    { interval: auto && page === 0 ? poll : 0 }
  );

  useEffect(() => { setPage(0); setOpen(null); }, [device, event, qtext, hours, levels]);

  if (!cfg || devicesLoading) return <p className="muted">Memuat…</p>;

  const d = q.data;
  const counts = d?.counts || { INFO: 0, WARN: 0, ERROR: 0 };
  const total = d?.total ?? 0;
  const first = total ? page * SIZE + 1 : 0;
  const last = Math.min(total, (page + 1) * SIZE);
  const toggle = (l) => setLevels((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));

  return (
    <>
      <div className="filters">
        <div className="field">
          <span className="lab">Tingkat</span>
          <div className="pchips">
            {LEVELS.map((l) => (
              <button key={l} type="button" className="pchip" aria-pressed={levels.includes(l)} onClick={() => toggle(l)}>
                <StatusShape level={LOG_SHAPE[l]} size={11} />
                {LEVEL_TEXT[l]} <b className="num" style={{ color: "var(--ink)" }}>{fmt(counts[l], 0)}</b>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="ev">Kejadian</label>
          <select id="ev" className="select" value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="">Semua kejadian</option>
            {(d?.events || []).map((e) => <option key={e} value={e}>{eventLabel(e)}</option>)}
          </select>
        </div>
        <div className="field">
          <span className="lab">Rentang</span>
          <Segmented label="Rentang waktu" value={hours} onChange={setHours} options={RANGES} />
        </div>
        <div className="field" style={{ minWidth: 200 }}>
          <label htmlFor="q">Cari</label>
          <div style={{ position: "relative" }}>
            <input id="q" className="input" style={{ width: "100%", paddingLeft: 30 }} placeholder="pesan, kejadian, atau isi paket" value={text} onChange={(e) => setText(e.target.value)} />
            <span style={{ position: "absolute", left: 8, top: 7, color: "var(--muted)" }}><Icon name="search" size={16} /></span>
          </div>
        </div>
      </div>

      {devicesLoading || (!d && q.loading) ? (
        <p className="muted">Memuat log…</p>
      ) : (
        <>
          <div className={`tablewrap${q.fetching ? " dim" : ""}`} style={{ maxHeight: "68vh" }}>
            <table className="t">
              <thead>
                <tr>
                  <th className="l">Waktu</th>
                  <th className="l">Tingkat</th>
                  <th className="l">Kejadian</th>
                  <th className="l">Sumber</th>
                  <th className="l">Pesan</th>
                </tr>
              </thead>
              <tbody>
                {d?.items.map((r) => {
                  const isOpen = open === r.id;
                  const body = pretty(r.payload);
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className="logrow" tabIndex={0} aria-expanded={body ? isOpen : undefined}
                        onClick={() => body && setOpen(isOpen ? null : r.id)}
                        onKeyDown={(e) => { if (body && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(isOpen ? null : r.id); } }}
                      >
                        <td className="l num">{r.ts}</td>
                        <td className="l">
                          <span className="row" style={{ gap: 6 }}>
                            <StatusShape level={LOG_SHAPE[r.level]} size={11} />
                            {LEVEL_TEXT[r.level]}
                          </span>
                        </td>
                        <td className="l" title={r.event}>{eventLabel(r.event)}</td>
                        <td className="l muted">{[r.device, r.type].filter(Boolean).join(" · ") || "server"}</td>
                        <td className="logmsg">{r.message}{body && <span className="note"> {isOpen ? "▾ sembunyikan paket" : "▸ lihat paket"}</span>}</td>
                      </tr>
                      {isOpen && (
                        <tr className="logdetail">
                          <td colSpan={5}><pre className="json">{body}</pre></td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {d && d.items.length === 0 && (
                  <tr><td colSpan={5} className="l" style={{ padding: 28, textAlign: "center" }}>Tidak ada log yang cocok dengan filter ini.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><Icon name="left" size={16} /> Lebih baru</button>
            <button className="btn" disabled={last >= total} onClick={() => setPage((p) => p + 1)}>Lebih lama <Icon name="right" size={16} /></button>
            <span className="note num">{fmt(first, 0)}–{fmt(last, 0)} dari {fmt(total, 0)} log</span>
            <span className="grow" />
            {auto && page === 0 && <span className="note row"><span className="pulse" /> Diperbarui otomatis</span>}
          </div>
        </>
      )}
    </>
  );
}
