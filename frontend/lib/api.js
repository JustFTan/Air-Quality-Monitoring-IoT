"use client";
import { useEffect, useState } from "react";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function qs(params) {
  const u = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : "";
}

export const apiUrl = (path, params) => `${API}${path}${qs(params)}`;

async function getJSON(path, params, signal) {
  const r = await fetch(apiUrl(path, params), { signal, cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/**
 * Ambil data dari API. Data lama tetap dipegang saat refetch (tidak ada kedipan skeleton).
 * path = null  -> tidak mengambil apa-apa.
 * interval     -> polling dalam ms (0 = mati).
 */
export function useApi(path, params, { interval = 0 } = {}) {
  const key = path ? path + qs(params) : null;
  const [state, setState] = useState({ data: null, error: null, loading: !!path, fetching: false, at: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) {
      setState((s) => (s.loading || s.fetching ? { ...s, loading: false, fetching: false } : s));
      return;
    }
    const ac = new AbortController();
    setState((s) => ({ ...s, fetching: true }));
    getJSON(path, params, ac.signal)
      .then((data) => setState({ data, error: null, loading: false, fetching: false, at: Date.now() }))
      .catch((e) => {
        if (e.name === "AbortError") return;
        setState((s) => ({ ...s, error: e, loading: false, fetching: false }));
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  // Polling berhenti saat tab tersembunyi (hemat kuota API/database), lalu menyegarkan saat tab dibuka lagi.
  useEffect(() => {
    if (!interval || !key) return;
    const visible = () => document.visibilityState === "visible";
    const id = setInterval(() => { if (visible()) setTick((t) => t + 1); }, interval);
    let hiddenAt = visible() ? null : Date.now();
    const onVis = () => {
      if (!visible()) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > interval) setTick((t) => t + 1);
      hiddenAt = null;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [interval, key]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
