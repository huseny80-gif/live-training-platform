"use client";

export type SourcePreparationProgress =
  | {
      stage: "EXTRACTING";
      documentId: string;
      fileName?: string;
      completedPages: number;
      requiredPages: number;
      totalPages: number;
    }
  | {
      stage: "READY";
      documentId: string;
      fileName?: string;
      completedPages: number;
      requiredPages: number;
      totalPages: number;
    }
  | {
      stage: "FAILED";
      error: string;
      rawError?: string;
      documentId?: string;
      completedPages?: number;
      requiredPages?: number;
      totalPages?: number;
    };

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      response.ok
        ? "استجابة غير صالحة من الخادم."
        : "فشل طلب اعتماد المصدر (" + response.status + ")."
    );
  }
}

export async function runDocumentSourcePreparation(params: {
  documentId: string;
  onProgress?: (message: string, progress?: SourcePreparationProgress) => void;
  maxSteps?: number;
}): Promise<Extract<SourcePreparationProgress, { stage: "READY" }>> {
  const { documentId, onProgress, maxSteps = 12 } = params;
  let lastCompleted = -1;

  for (let step = 0; step < maxSteps; step++) {
    onProgress?.(
      step === 0
        ? "جارٍ التحقق من الملف وبدء استخراج المصدر الحقيقي…"
        : "جارٍ متابعة استخراج الصفحات الحقيقية…"
    );

    const response = await fetch(
      "/api/documents/" + encodeURIComponent(documentId) + "/prepare-source",
      { method: "POST" }
    );

    const data = await parseJson(response);
    const stage = String(data.stage ?? "");

    if (stage === "FAILED" || !response.ok) {
      throw new Error(
        String(
          data.error ??
            data.rawError ??
            "تعذر اعتماد الملف كمصدر حقيقي."
        )
      );
    }

    if (stage === "READY") {
      const result = data as unknown as Extract<
        SourcePreparationProgress,
        { stage: "READY" }
      >;
      onProgress?.(
        "تم اعتماد الملف كمصدر: " +
          result.completedPages +
          " صفحة حقيقية من أصل " +
          result.totalPages +
          ".",
        result
      );
      return result;
    }

    if (stage === "EXTRACTING") {
      const progress = data as unknown as Extract<
        SourcePreparationProgress,
        { stage: "EXTRACTING" }
      >;

      const sameProgress = progress.completedPages === lastCompleted;
      onProgress?.(
        sameProgress && step > 0
          ? "لم تزد التغطية في المحاولة الأخيرة؛ تتم إعادة محاولة الصفحات غير المقروءة…"
          : "تم استخراج " +
              progress.completedPages +
              " صفحة حقيقية من أصل " +
              progress.requiredPages +
              " مطلوبة لاعتماد الملف.",
        progress
      );
      lastCompleted = progress.completedPages;
      continue;
    }

    throw new Error("حالة غير متوقعة أثناء اعتماد المادة التدريبية.");
  }

  throw new Error(
    "لم يكتمل اعتماد المصدر ضمن المحاولات الحالية. التقدم محفوظ؛ اضغط «متابعة اعتماد المصدر» لإكمال الصفحات المتبقية."
  );
}
