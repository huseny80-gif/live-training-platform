import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/realtime/io-singleton";

export const dynamic = "force-dynamic";

interface CheckResult {
  status: "ok" | "degraded" | "error";
  latencyMs?: number;
  reason?: string;
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (e) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      reason: e instanceof Error ? e.message : "unknown",
    };
  }
}

function checkRedis(): CheckResult {
  const hasUrl   = !!process.env.UPSTASH_REDIS_REST_URL;
  const hasToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!hasUrl || !hasToken) return { status: "degraded", reason: "not configured — rate limiting is fail-open" };
  return { status: "ok" };
}

function checkSocketIO(): CheckResult {
  return getIO() !== null
    ? { status: "ok" }
    : { status: "degraded", reason: "Socket.IO not initialised — real-time features unavailable" };
}

export async function GET() {
  const [db, redis, socketio] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkRedis()),
    Promise.resolve(checkSocketIO()),
  ]);

  const overallOk = db.status === "ok";
  const status = overallOk ? "ok" : "error";
  const httpStatus = overallOk ? 200 : 503;

  return NextResponse.json(
    { status, checks: { database: db, redis, socketio }, timestamp: new Date().toISOString() },
    { status: httpStatus }
  );
}
