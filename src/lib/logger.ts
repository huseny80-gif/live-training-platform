// Minimal structured JSON logger — no external dependencies.
// All log lines are newline-delimited JSON written to process.stderr.
// Fields matching SENSITIVE_KEYS are replaced with "[REDACTED]".

type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEYS = new Set([
  "password", "passwordHash", "secret", "token", "accessToken",
  "refreshToken", "apiKey", "authorization", "cookie", "sessionSecret",
  "UPSTASH_REDIS_REST_TOKEN", "AUTH_SECRET", "SESSION_SECRET",
]);

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

function write(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  const line: Record<string, unknown> = {
    level,
    msg,
    timestamp: new Date().toISOString(),
  };
  if (meta) {
    const safe = redact(meta) as Record<string, unknown>;
    Object.assign(line, safe);
  }
  process.stderr.write(JSON.stringify(line) + "\n");
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write("debug", msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => write("info",  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => write("warn",  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};
