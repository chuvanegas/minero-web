export function parseHashrateString(s) {
  if (s == null) return 0;
  if (typeof s === "number") return s;
  const m = String(s).trim().match(/^([\d.]+)\s*([PTGMK]?)/i);
  if (!m) return 0;
  const mult = { P: 1e15, T: 1e12, G: 1e9, M: 1e6, K: 1e3, "": 1 }[m[2].toUpperCase()] ?? 1;
  return parseFloat(m[1]) * mult;
}

export function fmtHashrate(hps) {
  if (!hps || hps <= 0) return "0 H/s";
  const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s"];
  let i = 0, v = hps;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${v.toFixed(2)} ${units[i]}`;
}

export function fmtDiff(d) {
  if (!d || d <= 0) return "0";
  const units = ["", "K", "M", "G", "T", "P", "E"];
  let i = 0, v = Number(d);
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${v.toFixed(2)}${units[i]}`;
}

export function fmtUptime(s) {
  if (!s || s <= 0) return "—";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}

export function minutesSince(unixSec) {
  if (!unixSec) return Infinity;
  return (Date.now() / 1000 - unixSec) / 60;
}

export function calcOdds(hashHps, netDiff) {
  if (!hashHps || !netDiff) return null;
  const expected = (netDiff * Math.pow(2, 32)) / hashHps;
  const perDay = 1 - Math.exp(-86400 / expected);
  return {
    years: expected / (86400 * 365),
    perDay,
    oneInDays: perDay > 0 ? Math.round(1 / perDay) : Infinity,
  };
}
