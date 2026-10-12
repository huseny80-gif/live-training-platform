ALTER TABLE "training_documents" ADD COLUMN "archived_at" TIMESTAMP(3);
CREATE INDEX "training_documents_program_id_archived_at_idx" ON "training_documents"("program_id", "archived_at");
