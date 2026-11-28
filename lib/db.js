const { Pool } = require("pg");

function secureConnectionString(value) {
  const url = new URL(value);
  // Keep certificate and hostname verification explicit as pg's defaults evolve.
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

let pool;
function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!pool) {
    pool = new Pool({
      connectionString: secureConnectionString(process.env.DATABASE_URL),
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true
    });
  }
  return pool;
}
module.exports = { getPool, secureConnectionString };
