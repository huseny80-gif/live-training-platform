export const brand = {
  productionUrl: "https://live-training-platform.vercel.app",
  trainerName: "Eng.Husen Yasen",
  nameAr: "الحقيبة التدريبية",
  nameEn: "Training Portfolio",
  taglineAr: "محتوى تدريبي ذكي من المصدر إلى التقييم",
  taglineEn: "Smart training content from source to assessment",
  colors: {
    primary: "#0F766E", primaryDark: "#115E59", navy: "#123C3A",
    interactive: "#0F766E", accent: "#C6A15B", background: "#F7F6F1",
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
