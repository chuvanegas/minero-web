import { SignJWT } from "jose";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { password } = req.body ?? {};
  if (!password || password !== process.env.DASHBOARD_PASSWORD) {
    await new Promise((r) => setTimeout(r, 500)); // throttle brute-force
    return res.status(401).json({ error: "Clave incorrecta" });
  }

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ sub: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  const isProd = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `auth_token=${token}; HttpOnly; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=Strict${isProd ? "; Secure" : ""}`
  );
  res.json({ ok: true });
}
