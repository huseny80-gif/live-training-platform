-- AlterEnum
-- This migration adds missing values and renames EXTRACTED->COMPLETED
-- Since the DB may have EXTRACTED values, we handle via a new type + cast

-- Step 1: Add new values to the enum (safe, no data issues)
ALTER TYPE "PageExtractionStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "PageExtractionStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "PageExtractionStatus" ADD VALUE IF NOT EXISTS 'OCR_REQUIRED';

-- Step 2: Migrate EXTRACTED -> COMPLETED
UPDATE "document_pages" SET "extraction_status" = 'COMPLETED' WHERE "extraction_status" = 'EXTRACTED';
UPDATE "document_pages" SET "extraction_status" = 'FAILED' WHERE "extraction_status" = 'SKIPPED';
