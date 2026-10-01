import { deflateSync } from "node:zlib";

/** A real PDF with accurate xref offsets and compressed page streams. Test-only. */
export function textPdf(pageCount = 1, scannedPages: number[] = []): Buffer {
  const objects: Buffer[] = [];
  const add = (value: string | Buffer) => { objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value)); return objects.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const image = add(Buffer.concat([Buffer.from("<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\n"), Buffer.from([0, 0, 0]), Buffer.from("\nendstream")]));
  const pages: number[] = [];
  for (let n = 1; n <= pageCount; n++) {
    const source = scannedPages.includes(n) ? "q 100 0 0 100 0 0 cm /Im1 Do Q" : `BT /F1 12 Tf 40 720 Td (GIS source page ${n}: geographic information systems store coordinates and support spatial analysis.) Tj ET`;
    const stream = deflateSync(Buffer.from(source));
    const content = add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`), stream, Buffer.from("\nendstream")]));
    pages.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> /XObject << /Im1 ${image} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[1] = Buffer.from(`<< /Type /Pages /Count ${pageCount} /Kids [${pages.map(n => `${n} 0 R`).join(" ")}] >>`);
  const chunks = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [0];
  let position = chunks[0].length;
  for (const [i, object] of objects.entries()) {
    offsets.push(position);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]);
    chunks.push(chunk); position += chunk.length;
  }
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF`));
  return Buffer.concat(chunks);
}
