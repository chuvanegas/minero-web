import axios from "axios";
import {
  parseHashrateString, fmtHashrate, fmtDiff, fmtUptime, minutesSince, calcOdds,
} from "../../lib/format";

// ── Redis helpers ──────────────────────────────────────────────
const RU = () => process.env.UPSTASH_REDIS_REST_URL;
const RT = () => process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCmd(cmd) {
  if (!RU() || !RT()) return null;
  try {
    const r = await axios.post(RU(), cmd,
      { headers:{ Authorization:`Bearer ${RT()}` }, timeout:5000 });
    return r.data?.result ?? null;
  } catch { return null; }
}

async function getMinersFromRedis() {
  const raw = await redisCmd(["GET","miners"]);
  if (!raw) return null;
  try {
    const data = typeof raw==="string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)||!data.length) return null;
    return data.map(m=>({ ...m, hashFmt:fmtHashrate(m.hashHps||0), uptimeFmt:fmtUptime(m.uptimeSeconds||0) }));
  } catch { return null; }
}

async function storeHashHistory(hashHps) {
  if (!RU()||!RT()) return;
  try {
    const raw  = await redisCmd(["GET","hr_history"]);
    const hist = raw ? (typeof raw==="string"?JSON.parse(raw):raw) : [];
    const now  = Date.now();
    if (hist.length && now - hist[hist.length-1].ts < 5*60*1000) return; // 1 punto cada 5 min
    hist.push({ ts:now, h:Math.round(hashHps) });
    if (hist.length > 288) hist.splice(0, hist.length-288); // 24h máximo
    await redisCmd(["SET","hr_history",JSON.stringify(hist),"EX",String(25*3600)]);
  } catch {}
}

async function getHashHistory() {
  const raw = await redisCmd(["GET","hr_history"]);
  if (!raw) return [];
  try { return typeof raw==="string"?JSON.parse(raw):raw; } catch { return []; }
}

// ── Precio BTC ─────────────────────────────────────────────────
async function getBTCPrice() {
  const sources = [
    ()=>axios.get("https://mempool.space/api/v1/prices",{timeout:5000}).then(r=>Number(r.data?.USD)||null),
    ()=>axios.get("https://api.coinbase.com/v2/prices/BTC-USD/spot",{timeout:5000}).then(r=>Number(r.data?.data?.amount)||null),
    ()=>axios.get("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",{timeout:5000}).then(r=>Number(r.data?.price)||null),
    ()=>axios.get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",{timeout:5000}).then(r=>r.data?.bitcoin?.usd||null),
  ];
  for (const fn of sources) {
    try { const p=await fn(); if(p&&p>1000) return p; } catch {}
  }
  return null;
}

// ── Mineros ────────────────────────────────────────────────────
function parseMiners() {
  const miners = [];
  for (let i=1; i<=20; i++) {
    const url = process.env[`MINER_${i}_URL`];
    if (!url) continue;
    miners.push({ id:i, name:process.env[`MINER_${i}_NAME`]||`Minero ${i}`, url:url.replace(/\/+$/,"") });
  }
  return miners;
}

async function getMiner(miner) {
  try {
    const { data } = await axios.get(`${miner.url}/api/system/info`, { timeout:7000 });
    const hashHps = (Number(data.hashRate)||0)*1e9;
    return {
      online:true, name:miner.name, url:miner.url,
      model:data.ASICModel||"—", hashHps, hashFmt:fmtHashrate(hashHps),
      temp:Number(data.temp)||0, vrTemp:Number(data.vrTemp)||0,
      power:Number(data.power)||0, fanrpm:Number(data.fanrpm)||0,
      sharesAccepted:Number(data.sharesAccepted)||0,
      sharesRejected:Number(data.sharesRejected)||0,
      bestDiff:data.bestDiff||"—", bestSessionDiff:data.bestSessionDiff||"—",
      uptimeSeconds:Number(data.uptimeSeconds)||0,
      uptimeFmt:fmtUptime(Number(data.uptimeSeconds)||0),
      frequency:Number(data.frequency)||0, stratumURL:data.stratumURL||"—",
    };
  } catch(err) {
    return { online:false, name:miner.name, url:miner.url, error:err.code||err.message };
  }
}

// ── solo.ckpool.org ────────────────────────────────────────────
async function getCkpool(address) {
  try {
    const { data } = await axios.get(`https://solo.ckpool.org/users/${address}`,
      { timeout:10000, headers:{ Accept:"application/json" } });
    const workers = Array.isArray(data.worker) ? data.worker.map(w=>({
      name:w.workername||"—",
      hashHps:parseHashrateString(w.hashrate5m||w.hashrate1m),
      hashFmt:fmtHashrate(parseHashrateString(w.hashrate5m||w.hashrate1m)),
      minsSinceShare:minutesSince(Number(w.lastshare)||0),
      bestEver:Number(w.bestever)||0,
      bestEverFmt:fmtDiff(Number(w.bestever)||0),
    })) : [];
    return {
      online:true, source:"ckpool", label:"solo.ckpool.org",
      hashHps5m:parseHashrateString(data.hashrate5m),
      hashHps1d:parseHashrateString(data.hashrate1d),
      hashFmt5m:fmtHashrate(parseHashrateString(data.hashrate5m)),
      hashFmt1d:fmtHashrate(parseHashrateString(data.hashrate1d)),
      workerCount:Number(data.workers)||workers.length,
      shares:Number(data.shares)||0,
      bestEver:Number(data.bestever)||0,
      bestEverFmt:fmtDiff(Number(data.bestever)||0),
      minsSinceShare:minutesSince(Number(data.lastshare)||0),
      workers,
    };
  } catch(err) {
    return { online:false, source:"ckpool", label:"solo.ckpool.org", error:err.message };
  }
}

// ── public-pool.io ─────────────────────────────────────────────
async function getPublicPool(address) {
  try {
    const { data } = await axios.get(`https://public-pool.io:40557/api/client/${address}`,{ timeout:10000 });
    const acc = data.accounting||{};
    const workers = Array.isArray(data.workers) ? data.workers.map(w=>{
      const ms = w.lastSeen?new Date(w.lastSeen).getTime():0;
      return {
        name:w.name||"—", hashHps:Number(w.hashRate)||0,
        hashFmt:fmtHashrate(Number(w.hashRate)||0),
        minsSinceShare:ms?(Date.now()-ms)/60000:Infinity,
        bestEver:Number(w.bestDifficulty)||0,
        bestEverFmt:fmtDiff(Number(w.bestDifficulty)||0),
        payoutMode:w.payoutMode||"—",
      };
    }) : [];
    const hashHps10m=Number(acc.hashRateLast10Minutes)||0;
    const hashHps1h =Number(acc.hashRateLastHour)||0;
    const bestEver  =Number(data.bestDifficulty)||0;
    const lastShareMs=acc.latestShareAt?new Date(acc.latestShareAt).getTime():0;
    return {
      online:true, source:"publicpool", label:"public-pool.io",
      hashHps10m, hashHps1h,
      hashFmt10m:fmtHashrate(hashHps10m), hashFmt1h:fmtHashrate(hashHps1h),
      workerCount:Number(data.workersCount)||workers.length,
      shares:Number(acc.totalAcceptedShares)||0,
      sharesLast10m:Number(acc.acceptedSharesLast10Minutes)||0,
      sharesLastHour:Number(acc.acceptedSharesLastHour)||0,
      bestEver, bestEverFmt:fmtDiff(bestEver),
      minsSinceShare:lastShareMs?(Date.now()-lastShareMs)/60000:Infinity,
      blockCandidates:Number(acc.blockCandidateCount)||0,
      workers,
    };
  } catch(err) {
    return { online:false, source:"publicpool", label:"public-pool.io", error:err.message };
  }
}

// ── Dificultad red ─────────────────────────────────────────────
async function getNetworkDiff() {
  try {
    const { data } = await axios.get("https://blockchain.info/q/getdifficulty",{ timeout:8000 });
    const d=Number(data); if(d>0) return d;
  } catch {}
  try {
    const { data } = await axios.get("https://mempool.space/api/v1/mining/difficulty-adjustments/1m",{ timeout:8000 });
    if(Array.isArray(data)&&data.length&&data[0][3]) return Number(data[0][3]);
  } catch {}
  return null;
}

// ── Cálculo financiero ─────────────────────────────────────────
function calcFinancials(hashHps, netDiff, btcPrice) {
  if (!hashHps||!netDiff||!btcPrice) return null;
  const netHashHps = netDiff * Math.pow(2,32) / 600;
  const shareOfNet = hashHps / netHashHps;
  const revenuePerDayBTC = shareOfNet * 144 * 3.125;
  return {
    revenuePerDayBTC,
    revenuePerDayUSD:  revenuePerDayBTC * btcPrice,
    revenuePerMonthUSD:revenuePerDayBTC * btcPrice * 30,
    revenuePerYearUSD: revenuePerDayBTC * btcPrice * 365,
    netHashHps,
    shareOfNet,
  };
}

// ── Handler ────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method!=="GET") return res.status(405).end();

  const miners  = parseMiners();
  const address = process.env.BTC_ADDRESS;
  const ppAddr  = process.env.PUBLIC_POOL_ADDRESS||address;

  const redisData = await getMinersFromRedis();
  const [minerData, ckpool, publicPool, netDiff, btcPrice, hrHistory] = await Promise.all([
    redisData ?? Promise.all(miners.map(getMiner)),
    address ? getCkpool(address)    : Promise.resolve({ online:false, source:"ckpool",      label:"solo.ckpool.org" }),
    ppAddr  ? getPublicPool(ppAddr) : Promise.resolve({ online:false, source:"publicpool",  label:"public-pool.io" }),
    getNetworkDiff(),
    getBTCPrice(),
    getHashHistory(),
  ]);

  const totalHps  = minerData.reduce((a,m)=>a+(m.online?m.hashHps:0),0);
  const totalPower= minerData.reduce((a,m)=>a+(m.online?m.power:0),0);
  const hashForOdds = (publicPool.online?publicPool.hashHps10m:0)||(ckpool.online?ckpool.hashHps5m:0)||totalHps;

  // Guardar historial (fire-and-forget)
  if (hashForOdds>0) storeHashHistory(hashForOdds);

  function addProgress(pool, bestEver) {
    if(!pool.online||!netDiff||!bestEver) return pool;
    const bp=(bestEver/netDiff)*100;
    return { ...pool, blockProgress:bp, blockProgressPct:bp.toExponential(2) };
  }

  const financials = calcFinancials(hashForOdds, netDiff, btcPrice);

  res.setHeader("Cache-Control","no-store");
  res.json({
    ts: Date.now(),
    miners: minerData,
    ckpool:     addProgress(ckpool,     ckpool.bestEver),
    publicPool: addProgress(publicPool, publicPool.bestEver),
    netDiff, netDiffFmt: netDiff?fmtDiff(netDiff):null,
    odds:       calcOdds(hashForOdds, netDiff),
    address,
    btcPrice,
    financials,
    hrHistory,
    fleet: {
      totalHps,
      totalHpsFmt:  fmtHashrate(totalHps),
      totalPower,
      onlineCount:  minerData.filter(m=>m.online).length,
      totalCount:   minerData.length,
    },
  });
}
