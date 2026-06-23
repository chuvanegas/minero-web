import axios from "axios";
import {
  parseHashrateString,
  fmtHashrate,
  fmtDiff,
  fmtUptime,
  minutesSince,
  calcOdds,
} from "../../lib/format";

function parseMiners() {
  const miners = [];
  for (let i = 1; i <= 20; i++) {
    const url = process.env[`MINER_${i}_URL`];
    if (!url) continue;
    miners.push({
      id: i,
      name: process.env[`MINER_${i}_NAME`] || `Minero ${i}`,
      url: url.replace(/\/+$/, ""),
    });
  }
  return miners;
}

async function getMiner(miner) {
  try {
    const { data } = await axios.get(`${miner.url}/api/system/info`, { timeout: 7000 });
    const hashHps = (Number(data.hashRate) || 0) * 1e9;
    return {
      online: true,
      name: miner.name,
      model: data.ASICModel || "—",
      hashHps,
      hashFmt: fmtHashrate(hashHps),
      temp: Number(data.temp) || 0,
      vrTemp: Number(data.vrTemp) || 0,
      power: Number(data.power) || 0,
      fanrpm: Number(data.fanrpm) || 0,
      sharesAccepted: Number(data.sharesAccepted) || 0,
      sharesRejected: Number(data.sharesRejected) || 0,
      bestDiff: data.bestDiff || "—",
      bestSessionDiff: data.bestSessionDiff || "—",
      uptimeSeconds: Number(data.uptimeSeconds) || 0,
      uptimeFmt: fmtUptime(Number(data.uptimeSeconds) || 0),
      frequency: Number(data.frequency) || 0,
      stratumURL: data.stratumURL || "—",
    };
  } catch (err) {
    return { online: false, name: miner.name, url: miner.url, error: err.code || err.message };
  }
}

// ── solo.ckpool.org ────────────────────────────────────────────
async function getCkpool(address) {
  try {
    const { data } = await axios.get(`https://solo.ckpool.org/users/${address}`, {
      timeout: 10000,
      headers: { Accept: "application/json" },
    });
    const workers = Array.isArray(data.worker)
      ? data.worker.map((w) => ({
          name: w.workername || "—",
          hashHps: parseHashrateString(w.hashrate5m || w.hashrate1m),
          hashFmt: fmtHashrate(parseHashrateString(w.hashrate5m || w.hashrate1m)),
          minsSinceShare: minutesSince(Number(w.lastshare) || 0),
          bestEver: Number(w.bestever) || 0,
          bestEverFmt: fmtDiff(Number(w.bestever) || 0),
        }))
      : [];

    const hashHps5m = parseHashrateString(data.hashrate5m);
    const hashHps1d = parseHashrateString(data.hashrate1d);
    const bestEver  = Number(data.bestever) || 0;
    const lastShare = Number(data.lastshare) || 0;

    return {
      online: true,
      source: "ckpool",
      label: "solo.ckpool.org",
      hashHps5m,
      hashHps1d,
      hashFmt5m: fmtHashrate(hashHps5m),
      hashFmt1d: fmtHashrate(hashHps1d),
      workerCount: Number(data.workers) || workers.length,
      shares: Number(data.shares) || 0,
      bestEver,
      bestEverFmt: fmtDiff(bestEver),
      minsSinceShare: minutesSince(lastShare),
      workers,
    };
  } catch (err) {
    return { online: false, source: "ckpool", label: "solo.ckpool.org", error: err.message };
  }
}

// ── public-pool.io ─────────────────────────────────────────────
async function getPublicPool(address) {
  try {
    const { data } = await axios.get(
      `https://public-pool.io:40557/api/client/${address}`,
      { timeout: 10000 }
    );

    const acc = data.accounting || {};
    const workers = Array.isArray(data.workers)
      ? data.workers.map((w) => {
          const lastSeenMs = w.lastSeen ? new Date(w.lastSeen).getTime() : 0;
          const minsSince  = lastSeenMs ? (Date.now() - lastSeenMs) / 60000 : Infinity;
          return {
            name: w.name || "—",
            hashHps: Number(w.hashRate) || 0,
            hashFmt: fmtHashrate(Number(w.hashRate) || 0),
            minsSinceShare: minsSince,
            bestEver: Number(w.bestDifficulty) || 0,
            bestEverFmt: fmtDiff(Number(w.bestDifficulty) || 0),
            payoutMode: w.payoutMode || "—",
          };
        })
      : [];

    const hashHps10m = Number(acc.hashRateLast10Minutes) || 0;
    const hashHps1h  = Number(acc.hashRateLastHour) || 0;
    const bestEver   = Number(data.bestDifficulty) || 0;

    const lastShareMs = acc.latestShareAt ? new Date(acc.latestShareAt).getTime() : 0;
    const minsSinceShare = lastShareMs ? (Date.now() - lastShareMs) / 60000 : Infinity;

    return {
      online: true,
      source: "publicpool",
      label: "public-pool.io",
      hashHps10m,
      hashHps1h,
      hashFmt10m: fmtHashrate(hashHps10m),
      hashFmt1h:  fmtHashrate(hashHps1h),
      workerCount: Number(data.workersCount) || workers.length,
      shares: Number(acc.totalAcceptedShares) || 0,
      sharesLast10m: Number(acc.acceptedSharesLast10Minutes) || 0,
      sharesLastHour: Number(acc.acceptedSharesLastHour) || 0,
      bestEver,
      bestEverFmt: fmtDiff(bestEver),
      minsSinceShare,
      blockCandidates: Number(acc.blockCandidateCount) || 0,
      workers,
    };
  } catch (err) {
    return { online: false, source: "publicpool", label: "public-pool.io", error: err.message };
  }
}

// ── Dificultad de red ─────────────────────────────────────────
async function getNetworkDiff() {
  try {
    const { data } = await axios.get("https://blockchain.info/q/getdifficulty", { timeout: 8000 });
    const d = Number(data);
    if (d > 0) return d;
  } catch {}
  try {
    const { data } = await axios.get(
      "https://mempool.space/api/v1/mining/difficulty-adjustments/1m",
      { timeout: 8000 }
    );
    if (Array.isArray(data) && data.length && data[0][3]) return Number(data[0][3]);
  } catch {}
  return null;
}

// ── Handler ───────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const miners  = parseMiners();
  const address = process.env.BTC_ADDRESS;
  const ppAddr  = process.env.PUBLIC_POOL_ADDRESS || address;

  const [minerData, ckpool, publicPool, netDiff] = await Promise.all([
    Promise.all(miners.map(getMiner)),
    address ? getCkpool(address) : Promise.resolve({ online: false, source: "ckpool", label: "solo.ckpool.org" }),
    ppAddr  ? getPublicPool(ppAddr) : Promise.resolve({ online: false, source: "publicpool", label: "public-pool.io" }),
    getNetworkDiff(),
  ]);

  const totalHps = minerData.reduce((a, m) => a + (m.online ? m.hashHps : 0), 0);

  // Para las odds usamos el mejor hashrate disponible
  const hashForOdds =
    (publicPool.online ? publicPool.hashHps10m : 0) ||
    (ckpool.online ? ckpool.hashHps5m : 0) ||
    totalHps;

  // Progreso al bloque para cada pool
  function addProgress(pool, bestEver) {
    if (!pool.online || !netDiff || !bestEver) return pool;
    const bp = (bestEver / netDiff) * 100;
    return { ...pool, blockProgress: bp, blockProgressPct: bp.toExponential(2) };
  }

  res.setHeader("Cache-Control", "no-store");
  res.json({
    ts: Date.now(),
    miners: minerData,
    ckpool:     addProgress(ckpool,     ckpool.bestEver),
    publicPool: addProgress(publicPool, publicPool.bestEver),
    netDiff,
    netDiffFmt: netDiff ? fmtDiff(netDiff) : null,
    odds: calcOdds(hashForOdds, netDiff),
    address,
  });
}
