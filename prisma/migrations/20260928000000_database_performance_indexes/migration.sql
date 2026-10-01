-- Phase 20.4.1 — Database Performance Indexes
-- Additive only — no destructive changes, no data migration.

-- INDEX 1: Covering index for per-question analytics breakdown
--
-- WHY: GET /api/session/[code]/analytics runs 2 COUNT queries per question
--   (one for correct, one for wrong) against participant_answers.
--   With 20 questions that is 40 COUNT queries per request, each doing a
--   full scan of all rows for the session.
--
-- This composite index lets PostgreSQL satisfy both counts in a single
--   Index-Only Scan on (session_id, session_question_id, is_final, is_correct)
--   without touching the heap. After the analytics N+1 fix the same index
--   supports the single groupBy query replacing all per-question counts.
--
-- NOTE: session_question_id + is_final already has @@index([sessionQuestionId, isFinal])
--   in schema.prisma.  This wider index supersedes it for analytics queries that
--   also filter on session_id and project is_correct.
CREATE INDEX IF NOT EXISTS "participant_answers_analytics_idx"
  ON participant_answers (session_id, session_question_id, is_final, is_correct);

-- INDEX 2: Composite sort index for leaderboard
--
-- WHY: GET /api/session/[code]/leaderboard and getLeaderboard() in service.ts
--   both ORDER BY total_score DESC, correct_count DESC, updated_at ASC.
--   Without this index PostgreSQL sorts the full result set in memory —
--   cost grows O(N log N) with participant count.
--
-- With this index the query becomes an ordered Index Scan; no sort step needed.
-- DESC/ASC directions match the query's ORDER BY exactly.
CREATE INDEX IF NOT EXISTS "session_participants_leaderboard_idx"
  ON session_participants (session_id, total_score DESC, correct_count DESC, updated_at ASC);
