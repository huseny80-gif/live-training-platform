"use client";
import { useMemo, useState } from "react";

export default function ShareSession({ code }: { code: string }) {
  const [open,setOpen]=useState(false); const [copied,setCopied]=useState(false);
  const url=useMemo(()=>typeof window==="undefined"?"":`${window.location.origin}/join?code=${encodeURIComponent(code)}`,[code]);
  async function copy(){await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),1500)}
  return <span className="dlp-share-wrap">
    <a className="dlp-session-button" href={`/join?code=${encodeURIComponent(code)}`} target="_blank" rel="noreferrer">معاينة كمتدرب</a>
    <button type="button" className="dlp-session-button primary" onClick={()=>setOpen(v=>!v)}>مشاركة مع المتدربين</button>
    {open&&<span className="dlp-share-panel"><strong>رابط الانضمام</strong><input readOnly value={url}/><button type="button" onClick={copy}>{copied?"تم النسخ":"نسخ الرابط"}</button><img alt="QR للانضمام" src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`}/></span>}
  </span>;
}