import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Si ya tiene sesión, redirige directo
  useEffect(() => {
    fetch("/api/status").then((r) => {
      if (r.ok) router.replace("/dashboard");
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        setError("Clave incorrecta. Intenta de nuevo.");
        setLoading(false);
      }
    } catch {
      setError("Error de conexión.");
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Minero · Acceso</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className="wrap">
        <div className="card">
          <div className="icon">⛏️</div>
          <h1>Minero Dashboard</h1>
          <p className="sub">Solo.ckpool · Bitaxe · AxeOS</p>

          <form onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              disabled={loading}
            />
            {error && <p className="err">{error}</p>}
            <button type="submit" disabled={loading || !password}>
              {loading ? (
                <span className="spin-wrap"><span className="spinner" /> Entrando...</span>
              ) : (
                "Entrar →"
              )}
            </button>
          </form>

          <p className="hint">Acceso privado · Solo para el propietario</p>
        </div>
      </div>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: radial-gradient(ellipse at 50% 0%, rgba(63,185,80,0.06) 0%, transparent 60%);
        }
        .card {
          background: var(--surface);
          border: 1px solid var(--border2);
          border-radius: 18px;
          padding: 40px 36px;
          width: 100%;
          max-width: 380px;
          text-align: center;
          box-shadow: 0 0 0 1px var(--border), 0 24px 60px rgba(0,0,0,0.5);
        }
        .icon { font-size: 2.4rem; margin-bottom: 14px; }
        h1 {
          font-size: 1.4rem;
          font-weight: 700;
          letter-spacing: -0.03em;
          margin-bottom: 6px;
        }
        .sub {
          font-size: 0.8rem;
          color: var(--muted);
          margin-bottom: 32px;
        }
        input {
          width: 100%;
          background: var(--surface3);
          border: 1px solid var(--border2);
          color: var(--text);
          padding: 12px 16px;
          border-radius: var(--r-sm);
          font-size: 0.95rem;
          margin-bottom: 10px;
          outline: none;
          transition: border-color 0.15s;
        }
        input:focus { border-color: var(--green); }
        input:disabled { opacity: 0.5; }
        .err {
          font-size: 0.8rem;
          color: var(--red);
          margin-bottom: 10px;
          padding: 8px 12px;
          background: var(--red-bg);
          border-radius: var(--r-sm);
          text-align: left;
        }
        button {
          width: 100%;
          background: var(--green);
          color: #000;
          border: none;
          padding: 12px;
          border-radius: var(--r-sm);
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
          letter-spacing: -0.01em;
        }
        button:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        button:active:not(:disabled) { transform: translateY(0); }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
        .spin-wrap { display: flex; align-items: center; justify-content: center; gap: 8px; }
        .spinner {
          display: inline-block;
          width: 14px; height: 14px;
          border: 2px solid rgba(0,0,0,0.3);
          border-top-color: #000;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .hint {
          font-size: 0.72rem;
          color: var(--dim);
          margin-top: 20px;
        }
        @media (max-width: 420px) {
          .card { padding: 32px 24px; }
        }
      `}</style>
    </>
  );
}
