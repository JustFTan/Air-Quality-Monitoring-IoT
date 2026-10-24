"use client";
import { useMemo } from "react";
import { useApi } from "@/lib/api";
import { PARAM_KEYS, toMs } from "@/lib/aq";

// Rata-rata per N menit supaya rentang panjang tetap ringan dan terbaca.
export function bucketFor(hours) {
  if (hours <= 24) return 0;
  if (hours <= 72) return 5;
  if (hours <= 168) return 10;
  if (hours <= 720) return 60;
  return 120;
}

const toRow = (r) => {
  const o = { t: toMs(r.created_at) };
  PARAM_KEYS.forEach((p) => (o[p] = r[p] ?? null));
  return o;
};

/**
 * Deret waktu untuk grafik.
 * source: min_valid | min_raw | hour_device | hour_calc
 * compareRaw: gabungkan data mentah sebagai <param>_raw (hanya untuk min_valid)
 */
export function useSeries({ device, source, hours, compareRaw = false, poll = 0 }) {
  const isCalc = source === "hour_calc";
  const isHour = source === "hour_device" || isCalc;
  const type = source === "min_raw" ? "2m_raw" : isHour ? "1h_valid" : "2m_validated";
  const bucket = isHour ? 0 : bucketFor(hours);
  const wantRaw = compareRaw && source === "min_valid";

  const main = useApi(device && !isCalc ? "/api/readings" : null, { device, type, hours, bucket, limit: 20000 }, { interval: poll });
  const calc = useApi(device && isCalc ? "/api/hourly" : null, { device, days: Math.max(hours / 24, 0.05) }, { interval: poll });
  const raw = useApi(device && wantRaw ? "/api/readings" : null, { device, type: "2m_raw", hours, bucket, limit: 20000 }, { interval: poll });

  const rows = useMemo(() => {
    let base = [];
    if (isCalc) base = (calc.data?.computed || []).map((r) => toRow({ ...r, created_at: r.hour }));
    else base = (main.data?.items || []).map(toRow);

    if (wantRaw && raw.data?.items) {
      const map = new Map(base.map((r) => [r.t, r]));
      raw.data.items.forEach((r) => {
        const t = toMs(r.created_at);
        const row = map.get(t) || (map.set(t, { t, ...Object.fromEntries(PARAM_KEYS.map((p) => [p, null])) }), map.get(t));
        PARAM_KEYS.forEach((p) => (row[`${p}_raw`] = r[p] ?? null));
      });
      base = [...map.values()].sort((a, b) => a.t - b.t);
    }
    if (isCalc && base.length) {
      const cut = base[base.length - 1].t - hours * 3600e3;
      base = base.filter((r) => r.t >= cut);
    }
    return base;
  }, [isCalc, calc.data, main.data, raw.data, wantRaw, hours]);

  const intervalMs = isHour ? 3600e3 : (bucket || 2) * 60e3;
  const active = isCalc ? calc : main;
  return {
    rows,
    intervalMs,
    gapMs: intervalMs * 1.75,
    total: active.data?.total ?? rows.length,
    loading: active.loading,
    fetching: active.fetching || (wantRaw && raw.fetching),
    error: active.error,
    isEmpty: !active.loading && rows.length === 0,
  };
}
