import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { formatTimestamp, videoAtTime } from "@/lib/exam-material/timestamps";
import type { VideoCue } from "@/lib/exam-material/video-transcript";
import "@/app/exam-material/exam-material.css";
export const dynamic = "force-dynamic";
export default async function VideoPreview({ params }: { params: Promise<{ id: string }> }) {
  const user = await auth(); if (!user?.user?.id) redirect("/login");
  const video = await prisma.trainingVideo.findFirst({ where: { id: (await params).id, archivedAt: null, program: { instructorId: user.user.id } } });
  if (!video) notFound();
  return <main className="em-page" dir="rtl" lang="ar"><div className="em-container em-stack"><Link href={`/resources?programId=${video.programId}`}>→ مكتبة الموارد</Link><h1>{video.title}</h1><div className="em-actions"><Link className="em-button em-secondary" href={`/exam-material?programId=${video.programId}#video-library`}>إدارة الفيديو وتفريغه</Link><a className="em-button" href={`/api/resources/exports/video/${video.id}`}>تحميل التفريغ SRT</a></div>
    <h2>المقاطع النصية المعتمدة من المدرب</h2>{(video.transcript as unknown as VideoCue[]).map(cue => { const url = video.mediaUrl ? videoAtTime(video.mediaUrl, cue.startSeconds) : null; return <article className="em-glass em-pad em-stack" key={cue.id}><p className="em-muted">{formatTimestamp(cue.startSeconds)}–{formatTimestamp(cue.endSeconds)}</p><blockquote>{cue.text}</blockquote>{url && <a href={url} target="_blank" rel="noreferrer">فتح المقطع في الفيديو ←</a>}</article>; })}
  </div></main>;
}
