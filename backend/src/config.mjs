import "dotenv/config";

function integer(name, fallback) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isFinite(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}

export const config = {
  port: integer("PORT", 10000),
  databaseUrl: process.env.DATABASE_URL || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  analysisModel: process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.6-sol",
  fastModel: process.env.OPENAI_FAST_MODEL || "gpt-5.6-terra",
  sessionPepper: process.env.SESSION_PEPPER || (process.env.NODE_ENV === "test" ? "test-session-pepper" : ""),
  corsOrigins: (process.env.CORS_ORIGINS || "https://wayan.com,https://www.wayan.com,http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  maxDailyReviews: integer("MAX_DAILY_REVIEWS", 20),
  maxSessionDailyReviews: integer("MAX_SESSION_DAILY_REVIEWS", 2),
  maxUploadBytes: integer("MAX_UPLOAD_MB", 15) * 1024 * 1024,
};

export function assertRuntimeConfig() {
  const missing = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (!config.openaiApiKey) missing.push("OPENAI_API_KEY");
  if (!config.sessionPepper || config.sessionPepper.length < 24) missing.push("SESSION_PEPPER (24+ characters)");
  if (missing.length) throw new Error(`Missing runtime configuration: ${missing.join(", ")}`);
}
