"use client";
import { useEffect, useState } from "react";

type Theme="light"|"dark";
type Size="small"|"medium"|"large";
const palettes={teal:{primary:"#00a6a6",dark:"#087f86",navy:"#0b1f3a",accent:"#d4af37"},blue:{primary:"#2563eb",dark:"#1d4ed8",navy:"#172554",accent:"#d4af37"},green:{primary:"#059669",dark:"#047857",navy:"#16352d",accent:"#d4af37"}} as const;
export default function AppearanceSettings(){
 const [theme,setTheme]=useState<Theme>("light"); const [size,setSize]=useState<Size>("medium"); const [palette,setPalette]=useState<keyof typeof palettes>("teal");
 useEffect(()=>{const t=(localStorage.getItem("portfolio-theme") as Theme)||"light";const s=(localStorage.getItem("portfolio-font-size") as Size)||"medium";const p=(localStorage.getItem("portfolio-palette") as keyof typeof palettes)||"teal";apply(t,s,p);setTheme(t);setSize(s);setPalette(p)},[]);
 function apply(t:Theme,s:Size,p:keyof typeof palettes){const root=document.documentElement;root.dataset.theme=t;root.dataset.fontSize=s;const x=palettes[p]||palettes.teal;root.style.setProperty("--brand-primary",x.primary);root.style.setProperty("--brand-primary-dark",x.dark);root.style.setProperty("--brand-navy",x.navy);root.style.setProperty("--brand-accent",x.accent)}
 function save(t:Theme,s:Size,p:keyof typeof palettes){setTheme(t);setSize(s);setPalette(p);localStorage.setItem("portfolio-theme",t);localStorage.setItem("portfolio-font-size",s);localStorage.setItem("portfolio-palette",p);apply(t,s,p)}
 return <div className="dlp-appearance-grid">
  <div><strong>المظهر</strong><div className="dlp-choice-group"><button className={theme==="light"?"active":""} onClick={()=>save("light",size,palette)}>فاتح</button><button className={theme==="dark"?"active":""} onClick={()=>save("dark",size,palette)}>داكن</button></div></div>
  <div><strong>حجم الخط</strong><div className="dlp-choice-group"><button className={size==="small"?"active":""} onClick={()=>save(theme,"small",palette)}>صغير</button><button className={size==="medium"?"active":""} onClick={()=>save(theme,"medium",palette)}>متوسط</button><button className={size==="large"?"active":""} onClick={()=>save(theme,"large",palette)}>كبير</button></div></div>
  <div><strong>لوحة الألوان</strong><div className="dlp-choice-group"><button className={palette==="teal"?"active":""} onClick={()=>save(theme,size,"teal")}>تركوازي</button><button className={palette==="blue"?"active":""} onClick={()=>save(theme,size,"blue")}>أزرق</button><button className={palette==="green"?"active":""} onClick={()=>save(theme,size,"green")}>أخضر</button></div></div>
  <p className="dlp-settings-note">تُحفظ اختيارات المظهر على هذا الجهاز ويمكن تغييرها في أي وقت.</p>
 </div>
}
