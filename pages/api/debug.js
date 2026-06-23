export default async function handler(req, res) {
  const RU = process.env.UPSTASH_REDIS_REST_URL;
  const RT = process.env.UPSTASH_REDIS_REST_TOKEN;

  const envCheck = {
    UPSTASH_REDIS_REST_URL: RU ? RU.slice(0,40)+"..." : "❌ NO SET",
    UPSTASH_REDIS_REST_TOKEN: RT ? RT.slice(0,20)+"..." : "❌ NO SET",
    MINER_1_URL: process.env.MINER_1_URL || "❌ NO SET",
    MINER_1_NAME: process.env.MINER_1_NAME || "❌ NO SET",
    BTC_ADDRESS: process.env.BTC_ADDRESS ? process.env.BTC_ADDRESS.slice(0,10)+"..." : "❌ NO SET",
  };

  let redisResult = null;
  let redisError = null;
  try {
    const response = await fetch(RU, {
      method: "POST",
      headers: { Authorization: `Bearer ${RT}`, "Content-Type": "application/json" },
      body: JSON.stringify(["GET","miners"]),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    const raw = data?.result;
    if (raw) {
      const miners = typeof raw === "string" ? JSON.parse(raw) : raw;
      redisResult = { ok: true, minersCount: miners.length,
        firstMiner: miners[0] ? { name:miners[0].name, online:miners[0].online,
          hashHps:miners[0].hashHps, temp:miners[0].temp, ts:miners[0].ts,
          ageSeconds: Math.round((Date.now()-miners[0].ts*1000)/1000)||
            Math.round((Date.now()-miners[0].ts)/1000)
        } : null };
    } else {
      redisResult = { ok: false, raw: raw, response: data };
    }
  } catch(e) {
    redisError = e.message;
  }

  res.json({ envCheck, redisResult, redisError, serverTime: Date.now() });
}
