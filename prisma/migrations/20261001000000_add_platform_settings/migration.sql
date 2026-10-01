CREATE TABLE "platform_settings" (
  "id" TEXT NOT NULL,
  "instructor_id" TEXT NOT NULL,
  "platform_name_ar" TEXT NOT NULL DEFAULT 'الحقيبة التدريبية',
  "platform_name_en" TEXT NOT NULL DEFAULT 'Training Portfolio',
  "tagline_ar" TEXT NOT NULL DEFAULT 'محتوى تدريبي ذكي من المصدر إلى التقييم',
  "tagline_en" TEXT NOT NULL DEFAULT 'Smart training content from source to assessment',
  "logo_url" TEXT,
  "primary_color" TEXT NOT NULL DEFAULT '#00A6A6',
  "primary_dark" TEXT NOT NULL DEFAULT '#087F86',
  "navy_color" TEXT NOT NULL DEFAULT '#0B1F3A',
  "accent_color" TEXT NOT NULL DEFAULT '#D4AF37',
  "default_language" "Language" NOT NULL DEFAULT 'AR',
  "default_theme" TEXT NOT NULL DEFAULT 'light',
  "font_scale" TEXT NOT NULL DEFAULT 'medium',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_settings_instructor_id_key" ON "platform_settings"("instructor_id");
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
