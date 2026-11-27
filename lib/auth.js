let jwks;

async function requireAdmin(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const error = new Error("Sign in to continue.");
    error.status = 401;
    throw error;
  }
  if (!process.env.NEON_AUTH_JWKS_URL) {
    const error = new Error("Neon Auth verification is not configured.");
    error.status = 503;
    throw error;
  }
  const { createRemoteJWKSet, jwtVerify } = await import("jose");
  if (!jwks) jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, { algorithms: ["EdDSA"] }));
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
  if (!process.env.ADMIN_USER_ID) {
    const error = new Error("Owner access has not been activated yet. Create the owner account, then finish the one-time admin activation.");
    error.status = 403;
    error.code = "ADMIN_SETUP_REQUIRED";
    throw error;
  }
  if (payload.sub !== process.env.ADMIN_USER_ID) {
    const error = new Error("This account is not authorised to manage JO'S Grill.");
    error.status = 403;
    throw error;
  }
  return { id: payload.sub };
}

module.exports = { requireAdmin };