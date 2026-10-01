-- Phase 20.2.3D: Add FK constraint questions.correct_option_id → question_options.id
-- ON DELETE RESTRICT: deleting a QuestionOption that is set as correctOption is blocked.
-- ON UPDATE CASCADE: if a QuestionOption id changes, the reference is updated automatically.
--
-- Safe to apply only when:
--   Audit 1 (orphan correctOptionId) = 0 rows
--   Audit 2 (cross-question option ref) = 0 rows
-- Run scripts/audit-correct-option-id.ts first to confirm.
--
-- Rollback:
--   ALTER TABLE "questions" DROP CONSTRAINT "questions_correct_option_id_fkey";

ALTER TABLE "questions"
  ADD CONSTRAINT "questions_correct_option_id_fkey"
  FOREIGN KEY ("correct_option_id")
  REFERENCES "question_options"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
