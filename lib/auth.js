const { Pool } = require("pg");
let jwks;
let authPool;

async function requireAdmin(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const error = new Error("Sign in to continue.");
    error.status = 401;
    throw error;
  }
  if (!process.env.NEON_AUTH_JWKS_URL || !process.env.AUTH_DATABASE_URL) {
    const error = new Error("Neon Auth verification is not configured.");
    error.status = 503;
    throw error;
  }
  if (!process.env.ADMIN_EMAIL) {
    const error = new Error("The restaurant owner email has not been configured yet.");
    error.status = 403;
    error.code = "ADMIN_SETUP_REQUIRED";
    throw error;
  }
  const { createRemoteJWKSet, jwtVerify } = await import("jose");
  if (!jwks) jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
  let payload;
  try {
    const origin = new URL(process.env.NEON_AUTH_BASE_URL).origin;
    ({ payload } = await jwtVerify(token, jwks, { issuer: origin }));
  } catch {
    const error = new Error("Your session is invalid or expired. Please sign in again.");
    error.status = 401;
    throw error;
  }
  if (!payload.sub) {
    const error = new Error("Your session is missing a user identity.");
    error.status = 401;
    throw error;
  }
  if (!authPool) {
    authPool = new Pool({
      connectionString: process.env.AUTH_DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true
    });
  }
  const result = await authPool.query('SELECT email FROM neon_auth."user" WHERE id = $1 LIMIT 1', [payload.sub]);
  const email = result.rows[0] && String(result.rows[0].email || "").toLowerCase();
  if (!email || email !== String(process.env.ADMIN_EMAIL).trim().toLowerCase()) {
    const error = new Error("This account is not authorised to manage JO'S Grill.");
    error.status = 403;
    throw error;
  }
  return { id: payload.sub, email };
}

module.exports = { requireAdmin };