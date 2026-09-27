"use server";

import { signIn } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";

export type LoginResult =
  | { success: true }
  | { success: false; error: string; retryAfterMs?: number };

// Fire-and-forget audit write — failures must never affect login flow.
async function writeLoginAudit(opts: {
  action: "LOGIN_SUCCESS" | "LOGIN_FAILURE" | "ACCOUNT_LOCKED";
  instructorId?: string;
  emailHash: string;
  ip: string;
  userAgent: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: "Instructor",
        entityId: opts.instructorId ?? opts.emailHash,
        action: opts.action,
        actorType: "INSTRUCTOR",
        actorId: opts.instructorId ?? null,
        metadata: {
          emailHash: opts.emailHash,
          ip: opts.ip,
          userAgent: opts.userAgent,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch {
    process.stderr.write(`[login] audit write failed for action=${opts.action}\n`);
  }
}

export async function loginAction(
  _prev: LoginResult | null,
  formData: FormData
): Promise<LoginResult> {
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    "unknown";
  const userAgent = hdrs.get("user-agent") ?? "unknown";

  const email = formData.get("email")?.toString() ?? "";
  const emailHash = createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
  const rateLimitKey = `login:${ip}:${email}`;
  const { allowed, retryAfterMs } = await checkRateLimit(rateLimitKey);

  if (!allowed) {
    void writeLoginAudit({ action: "ACCOUNT_LOCKED", emailHash, ip, userAgent })
      .catch((e: unknown) =>
        process.stderr.write(`[login] ACCOUNT_LOCKED audit failed: ${e instanceof Error ? e.message : e}\n`)
      );
    const minutes = Math.ceil(retryAfterMs / 60000);
    return {
      success: false,
      error: `Too many login attempts. Try again in ${minutes} minute(s).`,
      retryAfterMs,
    };
  }

  try {
    await signIn("credentials", {
      email,
      password: formData.get("password")?.toString() ?? "",
      redirect: false,
    });

    // Resolve instructorId for audit + lastLoginAt update (best-effort)
    const instructor = await prisma.instructor.findUnique({
      where: { email },
      select: { id: true },
    });
    if (instructor) {
      void prisma.instructor
        .update({ where: { id: instructor.id }, data: { lastLoginAt: new Date() } })
        .catch((e: unknown) =>
          process.stderr.write(`[login] lastLoginAt update failed: ${e instanceof Error ? e.message : e}\n`)
        );
      void writeLoginAudit({ action: "LOGIN_SUCCESS", instructorId: instructor.id, emailHash, ip, userAgent })
        .catch((e: unknown) =>
          process.stderr.write(`[login] LOGIN_SUCCESS audit failed: ${e instanceof Error ? e.message : e}\n`)
        );
    }

    return { success: true };
  } catch (err) {
    if (err instanceof AuthError) {
      void writeLoginAudit({ action: "LOGIN_FAILURE", emailHash, ip, userAgent })
        .catch((e: unknown) =>
          process.stderr.write(`[login] LOGIN_FAILURE audit failed: ${e instanceof Error ? e.message : e}\n`)
        );
      return { success: false, error: "Invalid email or password." };
    }
    throw err;
  }
}
