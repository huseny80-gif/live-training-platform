"use client";
import { useMemo, useState } from "react";

const DEFAULT_PUBLIC_PARTICIPANT_ORIGIN = "https://live-training-platform.vercel.app";

export default function ShareSession({ code }: { code: string }) {
  const [open,setOpen]=useState(false);
  const [copied,setCopied]=useState(false);
  const publicOrigin=(process.env.NEXT_PUBLIC_PARTICIPANT_URL || DEFAULT_PUBLIC_PARTICIPANT_ORIGIN).replace(/\/$/,"");
  const url=useMemo(()=>`${publicOrigin}/join/${encodeURIComponent(code)}`,[code,publicOrigin]);
  async function copy(){await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),1500)}
  return <span className="dlp-share-wrap">
    <a className="dlp-session-button" href={url} target="_blank" rel="noreferrer">معاينة كمتدرب</a>
    <button type="button" className="dlp-session-button primary" onClick={()=>setOpen(v=>!v)}>مشاركة مع المتدربين</button>
    {open&&<span className="dlp-share-panel">
      <strong>رابط الانضمام العام</strong>
      <small>هذا الرابط مخصص للمتدربين ولا يستخدم عنوان Preview.</small>
      <input readOnly value={url}/>
      <button type="button" onClick={copy}>{copied?"تم النسخ":"نسخ الرابط"}</button>
      <img alt="QR للانضمام" src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`}/>
    </span>}
  </span>;
}