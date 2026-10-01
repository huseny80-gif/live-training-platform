"use client";
import { useRouter } from "next/navigation";
export default function RefreshButton(){const router=useRouter();return <button type="button" className="dlp-refresh-button" onClick={()=>router.refresh()}>↻ تحديث</button>}