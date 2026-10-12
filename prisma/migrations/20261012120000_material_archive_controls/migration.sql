ALTER TABLE "exam_material_batches" ADD COLUMN "title" TEXT, ADD COLUMN "question_count" INTEGER NOT NULL DEFAULT 10, ADD COLUMN "deleted_at" TIMESTAMP(3);
UPDATE "exam_material_batches" SET "question_count" = jsonb_array_length("content"->'questions') WHERE jsonb_typeof("content"->'questions') = 'array';
CREATE INDEX "exam_material_batches_program_id_deleted_at_idx" ON "exam_material_batches"("program_id", "deleted_at");
