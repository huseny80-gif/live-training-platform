// MockExtractionAdapter — used in tests and when real adapters are unavailable.
// Returns realistic-looking Arabic GIS content without any network calls.

import type {
  ExtractionAdapter,
  ExtractionRequest,
  ExtractionResult,
  ExtractedPage,
  PdfContentType,
} from "../types";

const MOCK_ARABIC_CONTENT = [
  "# مقدمة في نظم المعلومات الجغرافية\n\n- تعريف نظم المعلومات الجغرافية (GIS)\n- مكوناتها الأساسية\n- تطبيقاتها في مجالات مختلفة",
  "# البيانات المكانية\n\n- أنواع البيانات: متجهية ونقطية\n- نماذج البيانات الجغرافية\n- الإسقاطات الجغرافية",
  "# الاستفسارات المكانية\n\n- أنواع التحليل المكاني\n- نظام الإحداثيات\n- قواعد البيانات الجغرافية",
  "# التحليل المكاني\n\n- أدوات التحليل\n- المنطقة العازلة (Buffer)\n- التراكب المكاني (Overlay)",
  "# تطبيقات GIS\n\n- التخطيط العمراني\n- إدارة الموارد الطبيعية\n- مراقبة البيئة",
];

export class MockExtractionAdapter implements ExtractionAdapter {
  readonly name = "MOCK" as const;

  supports(_contentType: PdfContentType): boolean {
    return true;
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResult> {
    const start = Date.now();
    const totalPagesEstimate = 5;
    const targetPages = req.pageNumbers ?? Array.from({ length: totalPagesEstimate }, (_, i) => i + 1);

    const pages: ExtractedPage[] = targetPages.map((pageNum, idx) => ({
      pageNumber: pageNum,
      extractedText: MOCK_ARABIC_CONTENT[idx % MOCK_ARABIC_CONTENT.length],
      title: `صفحة ${pageNum}`,
      extractionMethod: "MOCK",
      extractionStatus: "COMPLETED",
      confidenceScore: 0.95,
      processingMs: 10,
    }));

    return {
      pages,
      method: "MOCK",
      totalPages: targetPages.length,
      successCount: pages.length,
      failureCount: 0,
      processingMs: Date.now() - start,
    };
  }
}
