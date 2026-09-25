-- CreateEnum
CREATE TYPE "PageExtractionStatus" AS ENUM ('PENDING', 'EXTRACTED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "live_sessions" ADD COLUMN     "join_deadline_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "source_page_id" TEXT;

-- CreateTable
CREATE TABLE "document_pages" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "title" TEXT,
    "extracted_text" TEXT,
    "extracted_json" JSONB,
    "image_storage_path" TEXT,
    "extraction_status" "PageExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "extracted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_pages_document_id_idx" ON "document_pages"("document_id");

-- CreateIndex
CREATE INDEX "document_pages_extraction_status_idx" ON "document_pages"("extraction_status");

-- CreateIndex
CREATE UNIQUE INDEX "document_pages_document_id_page_number_key" ON "document_pages"("document_id", "page_number");

-- AddForeignKey
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "training_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_source_page_id_fkey" FOREIGN KEY ("source_page_id") REFERENCES "document_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
