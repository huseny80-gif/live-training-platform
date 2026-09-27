-- Migration: add_certificates
-- Additive only — no existing tables or columns modified.

-- Sequence for human-readable certificate numbers
CREATE SEQUENCE IF NOT EXISTS certificate_number_seq START 1;

-- Enum
CREATE TYPE "CertificateStatus" AS ENUM ('ISSUED', 'REVOKED');

-- Certificates table
CREATE TABLE "certificates" (
    "id"                 TEXT NOT NULL,
    "session_id"         TEXT NOT NULL,
    "participant_id"     TEXT NOT NULL,
    "program_id"         TEXT NOT NULL,
    "certificate_number" TEXT NOT NULL,
    "verification_code"  TEXT NOT NULL,
    "display_name"       TEXT NOT NULL,
    "program_title"      TEXT NOT NULL,
    "day_number"         INTEGER NOT NULL,
    "total_score"        DECIMAL(65,30) NOT NULL,
    "correct_count"      INTEGER NOT NULL,
    "questions_total"    INTEGER NOT NULL,
    "rank"               INTEGER,
    "status"             "CertificateStatus" NOT NULL DEFAULT 'ISSUED',
    "issued_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at"         TIMESTAMP(3),
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "certificates_certificate_number_key" ON "certificates"("certificate_number");
CREATE UNIQUE INDEX "certificates_verification_code_key"  ON "certificates"("verification_code");
CREATE UNIQUE INDEX "certificates_session_id_participant_id_key" ON "certificates"("session_id", "participant_id");

-- Performance indexes
CREATE INDEX "certificates_session_id_idx"        ON "certificates"("session_id");
CREATE INDEX "certificates_participant_id_idx"     ON "certificates"("participant_id");
CREATE INDEX "certificates_verification_code_idx"  ON "certificates"("verification_code");

-- Foreign keys (Restrict on delete — certificates are permanent records)
ALTER TABLE "certificates"
    ADD CONSTRAINT "certificates_session_id_fkey"
        FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "certificates"
    ADD CONSTRAINT "certificates_participant_id_fkey"
        FOREIGN KEY ("participant_id") REFERENCES "session_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "certificates"
    ADD CONSTRAINT "certificates_program_id_fkey"
        FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
