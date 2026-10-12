import Link from "next/link";
import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { resourceForOwner } from "@/lib/resources/service";
import { storage } from "@/lib/storage";
import { officePreview } from "@/lib/resources/preview";
import { formatSize } from "@/lib/resources/types";
import "@/app/exam-material/exam-material.css";
import "../resources.css";
export const dynamic = "force-dynamic";
export default async function ResourcePreview({ params }: { params: Promise<{ id: string }> }) {
  const user = await auth(); if (!user?.user?.id) redirect("/login");
  const file = await resourceForOwner((await params).id, user.user.id).catch(() => null);
  if (!file || file.archivedAt || file.status !== "READY" || !file.storagePath) notFound();
  const url = `/api/resources/${file.id}/file`; const extension = file.fileName.split(".").at(-1)?.toLowerCase();
  let preview: { text: string; limited: boolean } | null = null;
  if (extension === "txt" || ["docx", "pptx", "xlsx"].includes(extension ?? "")) {
    try { if (file.sizeBytes > 10 * 1024 * 1024) throw new Error("PREVIEW_TOO_LARGE"); const bytes = await storage.read(file.storagePath); preview = extension === "txt" ? { text: bytes.toString("utf8").slice(0, 50_000), limited: bytes.length > 50_000 } : officePreview(bytes, extension!); } catch { preview = null; }
  }
  return <main className="em-page" dir="rtl" lang="ar"><div className="em-container em-stack"><Link href={`/resources?programId=${file.programId}`}>→ مكتبة الموارد</Link><header className="em-glass em-pad"><h1>{file.title}</h1><p>{file.fileName} · {formatSize(Number(file.sizeBytes))}</p></header><a className="em-button" href={`${url}?download=1`}>تحميل الملف الأصلي</a>
    {["mp4", "webm"].includes(extension ?? "") && <Link className="em-button em-secondary" href={`/exam-material?programId=${file.programId}#video-library`}>ربط تفريغ الفيديو وتوليد المادة الامتحانية</Link>}
    {extension === "pdf" ? <iframe className="rl-document-preview" title={file.title} src={url}/> : ["mp4", "webm"].includes(extension ?? "") ? <video className="rl-video" controls preload="metadata" src={url}/> : preview ? <section className="em-glass em-pad"><p className="em-muted">معاينة نصية؛ قد يختلف التنسيق عن الملف الأصلي.{preview.limited && " العرض مختصر؛ حمّل الملف للاطلاع على كامل المحتوى."}</p><pre className="rl-preview-text">{preview.text || "لا يتضمن الملف نصًا قابلًا للمعاينة."}</pre></section> : <p className="em-glass em-pad">المعاينة النصية غير متاحة لهذا الملف أو تجاوزت سعتها؛ يمكنك تحميل الملف الأصلي.</p>}
  </div></main>;
}
