CREATE TABLE "exam_material_batches" (
 "id" TEXT NOT NULL, "program_id" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'GENERATING',
 "sources" JSONB NOT NULL, "content" JSONB, "instructor_guide" JSONB, "error_code" TEXT,
 "share_token" TEXT, "published_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completed_at" TIMESTAMP(3), CONSTRAINT "exam_material_batches_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "exam_material_batches_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "exam_material_batches_share_token_key" ON "exam_material_batches"("share_token");
CREATE INDEX "exam_material_batches_program_id_created_at_idx" ON "exam_material_batches"("program_id", "created_at");
CREATE TABLE "exam_material_attempts" (
 "id" TEXT NOT NULL, "batch_id" TEXT NOT NULL, "token_hash" TEXT NOT NULL, "answers" JSONB, "report" JSONB,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completed_at" TIMESTAMP(3),
 CONSTRAINT "exam_material_attempts_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "exam_material_attempts_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "exam_material_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "exam_material_attempts_token_hash_key" ON "exam_material_attempts"("token_hash");
CREATE INDEX "exam_material_attempts_batch_id_idx" ON "exam_material_attempts"("batch_id");
