import Image from "next/image";

export default function PlatformLogo({ size = 64, className = "" }: { size?: number; className?: string }) {
  return <Image src="/training-logo.webp" alt="شعار الحقيبة التدريبية" width={size} height={size} unoptimized className={`platform-logo ${className}`} />;
}
