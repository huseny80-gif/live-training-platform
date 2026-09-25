-- ACP-02: Partial Unique Index for Answer Idempotency
--
-- WHY partial index and not a standard unique constraint:
--   Prisma schema.prisma does not support partial (conditional) unique indexes.
--   A standard UNIQUE(session_question_id, participant_id) would block the retry
--   flow where the old answer is marked is_final=false before a new one is inserted.
--
-- WHAT this enforces:
--   At most ONE row per (session_question_id, participant_id) can have is_final = true.
--   Retry flow: UPDATE old answer SET is_final=false, then INSERT new with is_final=true.
--   Concurrent duplicate attempts: the second INSERT fails with unique_violation (23505).
--   Application layer catches this and returns HTTP 409.
--
-- HOW to preserve across future migrations:
--   Prisma does not drop manually created indexes unless the table is dropped.
--   If participant_answers is ever recreated, re-add this index in that migration SQL.

CREATE UNIQUE INDEX IF NOT EXISTS participant_answers_unique_final
  ON participant_answers (session_question_id, participant_id)
  WHERE is_final = true;