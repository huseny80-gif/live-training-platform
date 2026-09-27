-- Phase 20.2.5 — Enterprise Hardening & Governance
-- Additive migration only — no destructive changes.

-- Add mustResetPassword flag to instructors
ALTER TABLE "instructors" ADD COLUMN IF NOT EXISTS "must_reset_password" BOOLEAN NOT NULL DEFAULT false;

-- Add index on is_active for future admin queries
CREATE INDEX IF NOT EXISTS "instructors_is_active_idx" ON "instructors"("is_active");
