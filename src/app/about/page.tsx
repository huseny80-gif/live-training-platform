import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAdminProfile, saveAdminProfile } from "@/app/actions/admin-profile";

export default async function AboutPage() {
  const session=await auth(); if(!session?.user) redirect("/login");
  const { instructor, profile }=await getAdminProfile();
  return <main className="dlp-simple-page"><header className="dlp-program-header"><div><Link href="/dashboard">← الرئيسية</Link><strong>من نحن</strong></div></header>
  <div className="dlp-program-container"><section className="brand-card dlp-program-section">
    <h1>من نحن</h1><p>الملف التعريفي لمدير الحقيبة التدريبية.</p>
    <div className="dlp-about-preview">{profile?.photoUrl?<img src={profile.photoUrl} alt="صورة المدير"/>:<div className="dlp-about-avatar">👤</div>}<div><h2>{instructor?.name}</h2>{profile?.title&&<strong>{profile.title}</strong>}<p>{profile?.bio||"أضف نبذة تعريفية من النموذج أدناه."}</p><small>{profile?.organization}</small></div></div>
    <form action={async (formData: FormData) => { "use server"; await saveAdminProfile(formData); }} className="dlp-profile-form">
      <label>المسمى/الصفة<input name="title" defaultValue={profile?.title??""}/></label>
      <label>جهة العمل<input name="organization" defaultValue={profile?.organization??""}/></label>
      <label>المؤهل/البرنامج<input name="qualification" defaultValue={profile?.qualification??""}/></label>
      <label>البريد العام<input name="emailPublic" type="email" defaultValue={profile?.emailPublic??""}/></label>
      <label>الهاتف<input name="phone" defaultValue={profile?.phone??""}/></label>
      <label>الموقع الإلكتروني<input name="website" defaultValue={profile?.website??""}/></label>
      <label className="wide">رابط الصورة الشخصية<input name="photoUrl" type="url" defaultValue={profile?.photoUrl??""} placeholder="https://..."/></label>
      <label className="wide">نبذة كاملة<textarea name="bio" rows={6} defaultValue={profile?.bio??""}/></label>
      <button className="brand-button-primary dlp-new-button" type="submit">حفظ الملف التعريفي</button>
    </form>
  </section></div></main>;
}