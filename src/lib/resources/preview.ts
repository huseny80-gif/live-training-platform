import { unzipSync, strFromU8 } from "fflate";
import * as XLSX from "xlsx";
function decodeXml(text: string) {
  return text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[\da-f]+);/gi, (_, value: string) => {
    const named: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
    if (named[value]) return named[value];
    const point = value.startsWith("#x") ? parseInt(value.slice(2), 16) : Number(value.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
  });
}
export function officePreview(buffer: Buffer, extension: string): { text: string; limited: boolean } {
  if (buffer.length > 10 * 1024 * 1024) throw new Error("PREVIEW_TOO_LARGE");
  let total = 0;
  unzipSync(buffer, { filter: file => { total += file.originalSize; if (total > 10 * 1024 * 1024 || file.originalSize < 0) throw new Error("PREVIEW_TOO_LARGE"); return false; } });
  if (extension === "xlsx") {
    const book = XLSX.read(buffer, { type: "buffer", sheetRows: 101, cellFormula: false, cellHTML: false });
    const text = book.SheetNames.slice(0, 10).map(name => `${name}\n${XLSX.utils.sheet_to_csv(book.Sheets[name]).split("\n").slice(0, 100).join("\n")}`).join("\n\n");
    return { text: text.slice(0, 50_000), limited: true };
  }
  const files = unzipSync(buffer, { filter: file => extension === "docx" ? file.name === "word/document.xml" : /^ppt\/slides\/slide\d+\.xml$/.test(file.name) });
  const keys = Object.keys(files).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (!keys.length) throw new Error("INVALID_OFFICE_FILE");
  const text = keys.slice(0, 100).map(key => [...strFromU8(files[key]).matchAll(/<(?:w|a):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:w|a):t>/g)].map(m => decodeXml(m[1])).join("\n")).join("\n\n");
  return { text: text.slice(0, 50_000), limited: text.length > 50_000 || keys.length > 100 };
}
