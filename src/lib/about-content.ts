import { z } from "zod";

const text = (max = 4000) => z.string().trim().max(max);
const httpsUrl = z.string().trim().max(2000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}, "استخدم رابطاً كاملاً يبدأ بـ https:// أو اترك الحقل فارغاً.");
export const aboutSchema = z.object({
  title: text(150).min(2), introduction: text().min(10), programs: text(),
  name: text(150).min(2), jobTitle: text(200), responsibility: text(300),
  qualification: text(500), workplace: text(500), biography: text(),
  photoUrl: z.union([z.literal("/hussein-profile.webp"), httpsUrl]),
  goals: text(), audience: text(), content: text(), learning: text(), organization: text(),
  archiveTitle: text(200), archiveDescription: text(), archiveUrl: httpsUrl,
  notice: text(), phone: text(30).refine(v => !v || /^\+?[0-9]{8,15}$/.test(v), "أدخل رقم الهاتف مع رمز الدولة دون مسافات."),
  whatsapp: text(20).refine(v => !v || /^[0-9]{8,15}$/.test(v), "أدخل رقم واتساب مع رمز الدولة دون + أو مسافات."),
  email: z.union([z.literal(""), z.string().trim().email("أدخل بريداً إلكترونياً صحيحاً.").max(254)]),
  telegram: httpsUrl, linkedin: httpsUrl, facebook: httpsUrl,
});
export type AboutContent = z.infer<typeof aboutSchema>;

export const defaultAbout: AboutContent = {
  title: "منصة الحقيبة التدريبية",
  introduction: "منصة الحقيبة التدريبية مساحة تعليمية رقمية أُنشئت لتنظيم المنهج التدريبي لتدريب الكوادر ضمن متطلبات تغيير العنوان الوظيفي، وعرض مواده بطريقة واضحة وسهلة المتابعة.",
  programs: "أساسيات عمل المساحة في المسح الزلزالي على اليابسة\nنظم المعلومات الجغرافية — المستوى الأول",
  name: "حسين ياسين حسن", jobTitle: "ر. مهندسين أقدم", responsibility: "إعداد وتنظيم المحتوى وبناء المنصة",
  qualification: "بكالوريوس هندسة المساحة — كلية الهندسة، جامعة بغداد",
  workplace: "وزارة النفط — شركة الاستكشافات النفطية — هيئة العمل الحقلي",
  biography: "يشرف على تجميع المواد التدريبية وتحريرها وتحديثها دورياً بما يتوافق مع مفردات المنهج واحتياجات العمل الحقلي.",
  photoUrl: "/hussein-profile.webp",
  goals: "تجميع مواد البرامج التدريبية في مرجع واحد منظّم بدل تشتتها بين الملفات والمجموعات.\nتسهيل الوصول إلى المحتوى التدريبي والملفات المرتبطة بكل برنامج.\nتوفير أسئلة تفاعلية تتيح للمتدرب قياس فهمه بعد دراسة المحتوى.\nبناء أساس رقمي قابل للتوسّع والتحديث المستمر.",
  audience: "الكوادر المشاركة في البرامج التدريبية ضمن متطلبات تغيير العنوان الوظيفي.\nالعاملون في المساحة والمسح الزلزالي والعمل الحقلي.\nالمهتمون بتعلّم أساسيات نظم المعلومات الجغرافية وتطبيقاتها العملية.",
  content: "ملفات تدريبية ومراجع مرتبطة بكل برنامج.\nأيام تدريبية منظّمة تتضمن الأهداف والموضوعات وملخصات المحتوى.\nأسئلة اختيار متعدد وصح أو خطأ، مع الإجابات والتفسيرات ومراجع الصفحات.\nجلسات تفاعلية واختبارات نهائية لمتابعة الفهم والنتائج.",
  learning: "فهم أساسيات عمل المساحة في المسح الزلزالي على اليابسة.\nاكتساب المفاهيم الأساسية لنظم المعلومات الجغرافية.\nربط المعارف النظرية بالتطبيقات العملية في بيئة العمل الحقلي.\nالتقييم الذاتي المستمر عبر الأسئلة والاختبارات التفاعلية.",
  organization: "لكل برنامج تدريبي محتوى مستقل لا يختلط بغيره.\nتُربط الملفات والأيام التدريبية والأسئلة بالبرنامج الذي تتبعه.\nيراجع المدرب الأسئلة والإجابات قبل اعتمادها للاختبارات.\nتُتاح جلسات المشاركة للمتدربين عبر رمز أو رابط انضمام، مع متابعة النتائج.",
  archiveTitle: "فتح الأرشيف الإثرائي",
  archiveDescription: "أرشيف تعليمي خارجي مستقل يضم محاضرات ومسارد مصطلحات وتمارين ودراسات حالة وأسئلة. يُتاح للاطلاع والإثراء، ولا يُعدّ بديلاً عن المنهج المعتمد لكل برنامج تدريبي.",
  archiveUrl: "https://huseny80-gif.github.io/Finquiz/files/archive/course2-content-source.html",
  notice: "المحتوى المنشور قابل للتحديث والتطوير باستمرار. قد تُضاف مواد أو أسئلة جديدة وقد تُعدّل المواد الحالية. المحتوى التجريبي، إن وجد، مخصص للعرض ولا يُعتمد كمرجع أكاديمي نهائي؛ ويُرجع إلى المنهج والمراجع المعتمدة للبرنامج.",
  phone: "+9647706003138", whatsapp: "9647706003138", email: "huseny80@gmail.com",
  telegram: "", linkedin: "", facebook: "",
};

export const aboutGroups: { title: string; fields: { key: keyof AboutContent; label: string; multiline?: boolean; hint?: string }[] }[] = [
  { title: "تعريف المنصة", fields: [{ key: "title", label: "عنوان المنصة" }, { key: "introduction", label: "نبذة عن المنصة", multiline: true }, { key: "programs", label: "البرامج التدريبية", multiline: true, hint: "برنامج واحد في كل سطر." }] },
  { title: "إعداد وتنظيم", fields: [{ key: "name", label: "الاسم" }, { key: "jobTitle", label: "العنوان الوظيفي" }, { key: "responsibility", label: "الدور في المنصة" }, { key: "qualification", label: "المؤهل العلمي" }, { key: "workplace", label: "جهة العمل" }, { key: "biography", label: "نبذة عن المسؤول", multiline: true }, { key: "photoUrl", label: "رابط الصورة الشخصية", hint: "استخدم /hussein-profile.webp للصورة الحالية، أو رابط https لصورة جديدة." }] },
  { title: "المحتوى والأهداف", fields: [{ key: "goals", label: "الهدف من المنصة", multiline: true }, { key: "audience", label: "الفئة المستهدفة", multiline: true }, { key: "content", label: "طبيعة المحتوى", multiline: true }, { key: "learning", label: "أهداف التعلم", multiline: true }, { key: "organization", label: "طريقة تنظيم المواد", multiline: true }] },
  { title: "الأرشيف والتنبيه", fields: [{ key: "archiveTitle", label: "عنوان زر الأرشيف" }, { key: "archiveDescription", label: "وصف الأرشيف", multiline: true }, { key: "archiveUrl", label: "رابط الأرشيف" }, { key: "notice", label: "تنبيه تحديث المحتوى", multiline: true }] },
  { title: "تواصل معنا", fields: [{ key: "phone", label: "رقم الاتصال" }, { key: "whatsapp", label: "رقم واتساب" }, { key: "email", label: "البريد الإلكتروني" }, { key: "telegram", label: "رابط تيليجرام" }, { key: "linkedin", label: "رابط لينكدإن" }, { key: "facebook", label: "رابط فيسبوك" }] },
];

