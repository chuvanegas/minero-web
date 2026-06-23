#!/usr/bin/env python3
"""
relay/push.py  —  Corre en tu Mac, lee el Bitaxe cada 20s
y sube los datos a Upstash Redis para que Vercel los muestre.

Uso:
  python3 relay/push.py

Variables de entorno necesarias (en relay/.env):
  UPSTASH_REDIS_REST_URL=https://...upstash.io
  UPSTASH_REDIS_REST_TOKEN=...
  MINER_1_URL=http://192.168.11.48
  MINER_1_NAME=Bitaxe
"""

import json, os, time, urllib.request, urllib.error
from datetime import datetime

# ── Config ────────────────────────────────────────────────────
INTERVAL = 20   # segundos entre actualizaciones
TTL      = 120  # segundos que viven los datos en Redis

def load_env():
    env_file = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())

load_env()

REDIS_URL   = os.environ.get("UPSTASH_REDIS_REST_URL", "")
REDIS_TOKEN = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")

def parse_miners():
    miners = []
    for i in range(1, 20):
        url = os.environ.get(f"MINER_{i}_URL")
        if not url:
            break
        miners.append({
            "id":   i,
            "name": os.environ.get(f"MINER_{i}_NAME", f"Minero {i}"),
            "url":  url.rstrip("/"),
        })
    return miners

# ── Fetch Bitaxe ───────────────────────────────────────────────
def fetch_miner(m):
    try:
        req = urllib.request.Request(
            f"{m['url']}/api/system/info",
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            d = json.loads(r.read())

        hash_hps = float(d.get("hashRate", 0)) * 1e9
        shares_ok  = int(d.get("sharesAccepted", 0))
        shares_bad = int(d.get("sharesRejected", 0))
        total = shares_ok + shares_bad
        rate  = round(shares_ok / total * 100, 1) if total > 0 else 0

        return {
            "online":        True,
            "name":          m["name"],
            "url":           m["url"],
            "model":         d.get("ASICModel", "—"),
            "hashHps":       hash_hps,
            "temp":          float(d.get("temp", 0)),
            "vrTemp":        float(d.get("vrTemp", 0)),
            "power":         float(d.get("power", 0)),
            "fanrpm":        int(d.get("fanrpm", 0)),
            "sharesAccepted":shares_ok,
            "sharesRejected":shares_bad,
            "acceptRate":    rate,
            "bestDiff":      d.get("bestDiff", "—"),
            "bestSessionDiff":d.get("bestSessionDiff", "—"),
            "uptimeSeconds": int(d.get("uptimeSeconds", 0)),
            "frequency":     int(d.get("frequency", 0)),
            "stratumURL":    d.get("stratumURL", "—"),
            "ts":            int(time.time()),
        }
    except Exception as e:
        return {
            "online": False,
            "name":   m["name"],
            "url":    m["url"],
            "error":  str(e),
            "ts":     int(time.time()),
        }

# ── Subir a Redis ──────────────────────────────────────────────
def redis_set(key, value):
    if not REDIS_URL or not REDIS_TOKEN:
        raise ValueError("Faltan UPSTASH_REDIS_REST_URL y/o UPSTASH_REDIS_REST_TOKEN en relay/.env")

    payload = json.dumps(["SET", key, json.dumps(value), "EX", str(TTL)]).encode()
    req = urllib.request.Request(
        REDIS_URL,
        data    = payload,
        headers = {
            "Authorization": f"Bearer {REDIS_TOKEN}",
            "Content-Type":  "application/json",
        },
        method  = "POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

# ── Loop principal ─────────────────────────────────────────────
def fmt_hr(hps):
    if not hps: return "0 H/s"
    units = ["H/s","KH/s","MH/s","GH/s","TH/s"]
    i, v = 0, hps
    while v >= 1000 and i < len(units)-1:
        v /= 1000; i += 1
    return f"{v:.2f} {units[i]}"

def run():
    miners = parse_miners()
    if not miners:
        print("❌  No hay mineros en .env (pon MINER_1_URL=http://192.168.11.48)")
        return

    print(f"⛏️  Relay iniciado — {len(miners)} minero(s) — actualizando cada {INTERVAL}s")
    print(f"📡  Redis: {REDIS_URL[:40]}..." if REDIS_URL else "⚠️  Sin URL de Redis")
    print("─" * 50)

    while True:
        data = [fetch_miner(m) for m in miners]
        now  = datetime.now().strftime("%H:%M:%S")

        for d in data:
            if d["online"]:
                print(f"[{now}] ✅ {d['name']:12s}  {fmt_hr(d['hashHps']):12s}  "
                      f"temp:{d['temp']}°C  fan:{d['fanrpm']} rpm  "
                      f"shares:{d['sharesAccepted']}")
            else:
                print(f"[{now}] ❌ {d['name']:12s}  {d['error']}")

        try:
            redis_set("miners", data)
            print(f"[{now}] 🟢 Redis actualizado")
        except Exception as e:
            print(f"[{now}] 🔴 Error Redis: {e}")

        time.sleep(INTERVAL)

if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\n⏹️  Relay detenido.")
