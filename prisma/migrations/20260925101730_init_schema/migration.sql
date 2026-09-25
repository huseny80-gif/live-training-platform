-- CreateEnum
CREATE TYPE "InstructorRole" AS ENUM ('INSTRUCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('AR', 'EN');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentContentType" AS ENUM ('TEXT_BASED', 'IMAGE_BASED', 'MIXED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DocumentExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'OCR_REQUIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "DayStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'USED');

-- CreateEnum
CREATE TYPE "QuestionGeneratedBy" AS ENUM ('AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "OptionLabel" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "SessionQuestionStatus" AS ENUM ('DRAFT', 'READY', 'LIVE', 'CLOSED', 'RESULTS');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('JOINED', 'ONLINE', 'OFFLINE', 'RECONNECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('INSTRUCTOR', 'PARTICIPANT', 'SYSTEM');

-- CreateTable
CREATE TABLE "instructors" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "InstructorRole" NOT NULL DEFAULT 'INSTRUCTOR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instructors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_programs" (
    "id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "language" "Language" NOT NULL DEFAULT 'AR',
    "status" "ProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_documents" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "page_count" INTEGER,
    "mime_type" TEXT NOT NULL DEFAULT 'application/pdf',
    "content_type" "DocumentContentType" NOT NULL DEFAULT 'UNKNOWN',
    "extraction_status" "DocumentExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "extraction_notes" TEXT,
    "extracted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_days" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "document_id" TEXT,
    "day_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "objectives" TEXT[],
    "content_summary" TEXT,
    "page_range_start" INTEGER,
    "page_range_end" INTEGER,
    "status" "DayStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_topics" (
    "id" TEXT NOT NULL,
    "day_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topic_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "day_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_order" INTEGER NOT NULL,
    "question_type" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "correct_option_id" TEXT,
    "explanation" TEXT,
    "source_page_start" INTEGER,
    "source_page_end" INTEGER,
    "topic" TEXT,
    "language" "Language" NOT NULL DEFAULT 'AR',
    "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "weight" DECIMAL(65,30) NOT NULL DEFAULT 1.0,
    "generated_by" "QuestionGeneratedBy" NOT NULL DEFAULT 'AI',
    "ai_model" TEXT,
    "ai_prompt_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "option_label" "OptionLabel" NOT NULL,
    "option_text" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_sessions" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "session_code" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "title" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
    "current_question_id" TEXT,
    "allow_retry" BOOLEAN NOT NULL DEFAULT false,
    "scoring_config" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_participants" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "external_user_id" TEXT,
    "join_token_hash" TEXT NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'JOINED',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_score" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "answers_count" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_questions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "question_order" INTEGER NOT NULL,
    "status" "SessionQuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "time_limit_seconds" INTEGER,
    "started_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "results_shown_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_answers" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "session_question_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "selected_option_id" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "score_awarded" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "is_final" BOOLEAN NOT NULL DEFAULT true,
    "time_taken_seconds" INTEGER,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_day_results" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "questions_total" INTEGER NOT NULL DEFAULT 5,
    "questions_answered" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "wrong_count" INTEGER NOT NULL DEFAULT 0,
    "total_score" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_day_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_results" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "total_participants" INTEGER NOT NULL,
    "total_questions" INTEGER NOT NULL DEFAULT 5,
    "total_answers" INTEGER NOT NULL,
    "total_correct" INTEGER NOT NULL,
    "total_wrong" INTEGER NOT NULL,
    "correct_rate" DECIMAL(65,30) NOT NULL,
    "average_score" DECIMAL(65,30) NOT NULL,
    "highest_score" DECIMAL(65,30) NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_results" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "total_participants" INTEGER NOT NULL,
    "total_questions" INTEGER NOT NULL,
    "total_answers" INTEGER NOT NULL,
    "total_correct" INTEGER NOT NULL,
    "correct_rate" DECIMAL(65,30) NOT NULL,
    "average_score" DECIMAL(65,30) NOT NULL,
    "highest_score" DECIMAL(65,30) NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instructors_email_key" ON "instructors"("email");

-- CreateIndex
CREATE INDEX "instructors_email_idx" ON "instructors"("email");

-- CreateIndex
CREATE INDEX "training_programs_instructor_id_idx" ON "training_programs"("instructor_id");

-- CreateIndex
CREATE INDEX "training_programs_status_idx" ON "training_programs"("status");

-- CreateIndex
CREATE INDEX "training_documents_program_id_idx" ON "training_documents"("program_id");

-- CreateIndex
CREATE INDEX "training_documents_extraction_status_idx" ON "training_documents"("extraction_status");

-- CreateIndex
CREATE INDEX "training_days_program_id_idx" ON "training_days"("program_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_days_program_id_day_number_key" ON "training_days"("program_id", "day_number");

-- CreateIndex
CREATE INDEX "training_topics_day_id_idx" ON "training_topics"("day_id");

-- CreateIndex
CREATE INDEX "questions_day_id_idx" ON "questions"("day_id");

-- CreateIndex
CREATE INDEX "questions_program_id_idx" ON "questions"("program_id");

-- CreateIndex
CREATE INDEX "questions_status_idx" ON "questions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "questions_day_id_question_order_key" ON "questions"("day_id", "question_order");

-- CreateIndex
CREATE INDEX "question_options_question_id_idx" ON "question_options"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_question_id_option_label_key" ON "question_options"("question_id", "option_label");

-- CreateIndex
CREATE UNIQUE INDEX "live_sessions_session_code_key" ON "live_sessions"("session_code");

-- CreateIndex
CREATE INDEX "live_sessions_program_id_idx" ON "live_sessions"("program_id");

-- CreateIndex
CREATE INDEX "live_sessions_instructor_id_idx" ON "live_sessions"("instructor_id");

-- CreateIndex
CREATE INDEX "live_sessions_session_code_idx" ON "live_sessions"("session_code");

-- CreateIndex
CREATE INDEX "live_sessions_status_idx" ON "live_sessions"("status");

-- CreateIndex
CREATE INDEX "session_participants_session_id_idx" ON "session_participants"("session_id");

-- CreateIndex
CREATE INDEX "session_participants_session_id_status_idx" ON "session_participants"("session_id", "status");

-- CreateIndex
CREATE INDEX "session_participants_external_user_id_idx" ON "session_participants"("external_user_id");

-- CreateIndex
CREATE INDEX "session_questions_session_id_idx" ON "session_questions"("session_id");

-- CreateIndex
CREATE INDEX "session_questions_status_idx" ON "session_questions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "session_questions_session_id_question_order_key" ON "session_questions"("session_id", "question_order");

-- CreateIndex
CREATE UNIQUE INDEX "session_questions_session_id_question_id_key" ON "session_questions"("session_id", "question_id");

-- CreateIndex
CREATE INDEX "participant_answers_session_id_idx" ON "participant_answers"("session_id");

-- CreateIndex
CREATE INDEX "participant_answers_session_question_id_idx" ON "participant_answers"("session_question_id");

-- CreateIndex
CREATE INDEX "participant_answers_participant_id_idx" ON "participant_answers"("participant_id");

-- CreateIndex
CREATE INDEX "participant_answers_session_question_id_is_final_idx" ON "participant_answers"("session_question_id", "is_final");

-- CreateIndex
CREATE INDEX "participant_day_results_session_id_day_number_idx" ON "participant_day_results"("session_id", "day_number");

-- CreateIndex
CREATE UNIQUE INDEX "participant_day_results_session_id_participant_id_day_numbe_key" ON "participant_day_results"("session_id", "participant_id", "day_number");

-- CreateIndex
CREATE UNIQUE INDEX "daily_results_session_id_key" ON "daily_results"("session_id");

-- CreateIndex
CREATE INDEX "daily_results_session_id_idx" ON "daily_results"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_results_session_id_key" ON "session_results"("session_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_documents" ADD CONSTRAINT "training_documents_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_days" ADD CONSTRAINT "training_days_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_days" ADD CONSTRAINT "training_days_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "training_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_topics" ADD CONSTRAINT "training_topics_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "training_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "training_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_answers" ADD CONSTRAINT "participant_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_answers" ADD CONSTRAINT "participant_answers_session_question_id_fkey" FOREIGN KEY ("session_question_id") REFERENCES "session_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_answers" ADD CONSTRAINT "participant_answers_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "session_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_answers" ADD CONSTRAINT "participant_answers_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "question_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_day_results" ADD CONSTRAINT "participant_day_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_day_results" ADD CONSTRAINT "participant_day_results_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "session_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_results" ADD CONSTRAINT "daily_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_results" ADD CONSTRAINT "session_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "instructors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
