CREATE TABLE "admin_profiles" (
  "id" TEXT NOT NULL,
  "instructor_id" TEXT NOT NULL,
  "title" TEXT,
  "organization" TEXT,
  "qualification" TEXT,
  "bio" TEXT,
  "phone" TEXT,
  "email_public" TEXT,
  "website" TEXT,
  "photo_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_profiles_instructor_id_key" ON "admin_profiles"("instructor_id");
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
