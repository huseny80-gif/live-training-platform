export const brand = {
  nameAr: "الحقيبة التدريبية",
  nameEn: "Training Portfolio",
  taglineAr: "محتوى تدريبي ذكي من المصدر إلى التقييم",
  taglineEn: "Smart training content from source to assessment",
  instructorName: "Eng.Husen yasen",
  instructorTitleAr: "مدير ومطور الحقيبة التدريبية",
  colors: {
    primary: "#00A6A6", primaryDark: "#087F86", navy: "#0B1F3A",
    interactive: "#2563EB", accent: "#D4AF37", background: "#F8FAFC",
    surface: "#FFFFFF", border: "#E2E8F0", muted: "#64748B", text: "#0F172A",
    success: "#16A34A", warning: "#D97706", danger: "#DC2626",
  },
  typography: {
    arabic: '"Cairo", "Noto Sans Arabic", system-ui, sans-serif',
    latin: '"Inter", system-ui, sans-serif',
    baseSize: "16px",
  },
  radius: { sm: "8px", md: "12px", lg: "16px", xl: "24px" },
} as const;

export type Brand = typeof brand;
