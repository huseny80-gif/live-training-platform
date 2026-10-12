CREATE TABLE "training_videos" (
  "id" TEXT NOT NULL,
  "program_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "media_url" TEXT,
  "transcript" JSONB NOT NULL,
  "transcript_hash" TEXT NOT NULL,
  "source_reviewed_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_videos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_videos_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "training_videos_program_id_archived_at_idx" ON "training_videos"("program_id", "archived_at");
