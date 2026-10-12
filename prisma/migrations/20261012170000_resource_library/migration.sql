CREATE TABLE "resource_categories" (
  "id" TEXT NOT NULL, "program_id" TEXT NOT NULL, "key" TEXT NOT NULL,
  "name" TEXT NOT NULL, "icon" TEXT NOT NULL DEFAULT '📁',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "resource_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "resource_categories_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "resource_categories_program_id_key_key" ON "resource_categories"("program_id", "key");
CREATE TABLE "resource_files" (
  "id" TEXT NOT NULL, "program_id" TEXT NOT NULL, "category_key" TEXT NOT NULL,
  "title" TEXT NOT NULL, "file_name" TEXT NOT NULL, "mime_type" TEXT NOT NULL, "size_bytes" INTEGER NOT NULL,
  "blob_path" TEXT NOT NULL, "storage_path" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "resource_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "resource_files_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "resource_files_program_id_category_key_fkey" FOREIGN KEY ("program_id", "category_key") REFERENCES "resource_categories"("program_id", "key") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "resource_files_blob_path_key" ON "resource_files"("blob_path");
CREATE INDEX "resource_files_program_id_archived_at_status_idx" ON "resource_files"("program_id", "archived_at", "status");
