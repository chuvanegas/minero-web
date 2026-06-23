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
    return { online: false, name: miner.name, error: err.code || err.message };
  }
}

async function getPool(address) {
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
          lastShare: Number(w.lastshare) || 0,
          minsSinceShare: minutesSince(Number(w.lastshare) || 0),
          bestEver: Number(w.bestever) || 0,
          bestEverFmt: fmtDiff(Number(w.bestever) || 0),
        }))
      : [];

    const hashHps5m = parseHashrateString(data.hashrate5m);
    const hashHps1d = parseHashrateString(data.hashrate1d);
    const bestEver = Number(data.bestever) || 0;
    const lastShare = Number(data.lastshare) || 0;

    return {
      online: true,
      hashHps5m,
      hashHps1d,
      hashFmt5m: fmtHashrate(hashHps5m),
      hashFmt1d: fmtHashrate(hashHps1d),
      workerCount: Number(data.workers) || workers.length,
      shares: Number(data.shares) || 0,
      bestEver,
      bestEverFmt: fmtDiff(bestEver),
      lastShare,
      minsSinceShare: minutesSince(lastShare),
      workers,
    };
  } catch (err) {
    return { online: false, error: err.message };
  }
}

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

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const miners = parseMiners();
  const address = process.env.BTC_ADDRESS;

  const [minerData, pool, netDiff] = await Promise.all([
    Promise.all(miners.map(getMiner)),
    address ? getPool(address) : Promise.resolve({ online: false }),
    getNetworkDiff(),
  ]);

  const totalHps = minerData.reduce((a, m) => a + (m.online ? m.hashHps : 0), 0);
  const hashForOdds = pool.online
    ? pool.hashHps1d || pool.hashHps5m || totalHps
    : totalHps;

  const blockProgress =
    netDiff && pool.online && pool.bestEver ? (pool.bestEver / netDiff) * 100 : null;

  res.setHeader("Cache-Control", "no-store");
  res.json({
    ts: Date.now(),
    miners: minerData,
    pool: pool.online
      ? { ...pool, blockProgress, blockProgressPct: blockProgress?.toExponential(2) ?? null }
      : pool,
    netDiff,
    netDiffFmt: netDiff ? fmtDiff(netDiff) : null,
    odds: calcOdds(hashForOdds, netDiff),
    address,
  });
}
