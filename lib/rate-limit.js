const crypto = require("crypto");
const { getPool } = require("./db");

async function allowOrderRequest(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "") ||
    req.socket?.remoteAddress ||
    "unknown";
  // Store only a one-way digest; never persist the visitor's raw IP address.
  const bucketKey = crypto.createHash("sha256").update(ip).digest("hex");
  const db = getPool();
  const result = await db.query(
    `INSERT INTO public.api_rate_limits (bucket_key, window_started_at, request_count, updated_at)
     VALUES ($1, now(), 1, now())
     ON CONFLICT (bucket_key) DO UPDATE SET
       request_count = CASE
         WHEN public.api_rate_limits.window_started_at <= now() - interval '10 minutes' THEN 1
         ELSE public.api_rate_limits.request_count + 1
       END,
       window_started_at = CASE
         WHEN public.api_rate_limits.window_started_at <= now() - interval '10 minutes' THEN now()
         ELSE public.api_rate_limits.window_started_at
       END,
       updated_at = now()
     RETURNING request_count`,
    [bucketKey]
  );
  const count = Number(result.rows[0]?.request_count || 0);
  if (count > 8) return false;
  if (count === 8) {
    // Opportunistic bounded cleanup; old visitor hashes are not retained indefinitely.
    await db.query("DELETE FROM public.api_rate_limits WHERE updated_at < now() - interval '7 days'");
  }
  return true;
}

module.exports = { allowOrderRequest };
