import { zipSync, strToU8 } from "fflate";
import { statusLabel } from "@/lib/labels";
export interface WordQuestion {
  questionText: string; questionType: string; status: string; explanation: string | null;
  correctOptionId: string | null; options: { id: string; optionText: string }[];
}
function xml(value: string) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}
function paragraph(text: string, bold = false) {
  const rtl = /[\u0600-\u06ff]/u.test(text);
  return `<w:p><w:pPr>${rtl ? '<w:bidi/><w:jc w:val="right"/>' : '<w:jc w:val="left"/>'}<w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${bold ? '<w:b/><w:bCs/>' : ''}${rtl ? '<w:rtl/>' : ''}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:bidi="ar-IQ"/></w:rPr>${text.split(/\r\n|\r|\n/).map(t => `<w:t xml:space="preserve">${xml(t)}</w:t>`).join('<w:br/>')}</w:r></w:p>`;
}
export function buildFinalExamWord(title: string, questions: WordQuestion[]): Uint8Array {
  if (!questions.length) throw new Error("NO_QUESTIONS");
  if (questions.some(q => q.options.length < 2 || !q.options.some(o => o.id === q.correctOptionId))) throw new Error("INVALID_ANSWER");
  const body = [paragraph(title, true), paragraph("الأسئلة النهائية مع الحلول — نسخة خاصة بالمدرب"), paragraph(`عدد الأسئلة: ${questions.length}`)];
  questions.forEach((q, i) => {
    body.push(paragraph(`${i + 1}. ${q.questionText}`, true), paragraph(`${q.questionType === "TRUE_FALSE" ? "صح / خطأ" : "اختيار من متعدد"} · ${statusLabel(q.status)}`));
    q.options.forEach((o, j) => body.push(paragraph(`${j + 1}) ${o.optionText}`)));
    body.push(paragraph(`الإجابة الصحيحة: ${q.options.find(o => o.id === q.correctOptionId)!.optionText}`, true));
    if (q.explanation) body.push(paragraph(`التفسير: ${q.explanation}`));
  });
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`),
  });
}
