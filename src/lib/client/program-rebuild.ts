"use client";

export type ProgramRebuildProgress =
  | {
      stage: "EXTRACTING";
      documentId: string;
      fileName?: string;
      completedPages: number;
      requiredPages: number;
      totalPages: number;
    }
  | {
      stage: "COMPLETED";
      documentId: string;
      fileName?: string;
      daysGenerated: number;
      questionsGenerated: number;
      completedPages: number;
      requiredPages: number;
      totalPages: number;
    }
  | {
      stage: "BLOCKED_BY_SESSIONS";
      error: string;
      sessions?: Array<{ code: string; status: string }>;
    }
  | {
      stage: "FAILED";
      error: string;
      rawError?: string;
      documentId?: string;
    };

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      response.ok
        ? "استجابة غير صالحة من الخادم."
        : "فشل الطلب (" + response.status + ")."
    );
  }
}

export async function runProgramRebuild(params: {
  programId: string;
  documentId?: string;
  onProgress?: (message: string, progress?: ProgramRebuildProgress) => void;
  maxSteps?: number;
}): Promise<Extract<ProgramRebuildProgress, { stage: "COMPLETED" }>> {
  const { programId, documentId, onProgress, maxSteps = 16 } = params;
  let lastCompleted = -1;

  for (let step = 0; step < maxSteps; step++) {
    onProgress?.(
      step === 0
        ? "جارٍ فحص المصدر الحقيقي وبدء المعالجة…"
        : "جارٍ متابعة استخراج الصفحات الحقيقية…"
    );

    const response = await fetch(
      "/api/programs/" + encodeURIComponent(programId) + "/rebuild",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(documentId ? { documentId } : {}),
      }
    );

    const data = await parseJson(response);
    const stage = String(data.stage ?? "");

    if (stage === "BLOCKED_BY_SESSIONS") {
      const sessions = Array.isArray(data.sessions)
        ? (data.sessions as Array<{ code: string; status: string }>)
        : [];
      const codes = sessions.map((item) => item.code).filter(Boolean).join("، ");
      throw new Error(
        String(data.error ?? "يجب حذف الجلسات قبل إعادة بناء بنك الأسئلة.") +
          (codes ? " الجلسات: " + codes : "")
      );
    }

    if (stage === "FAILED" || !response.ok) {
      throw new Error(
        String(
          data.error ??
            data.rawError ??
            "تعذر إكمال تحليل المادة وتوليد الأسئلة."
        )
      );
    }

    if (stage === "COMPLETED") {
      const result = data as unknown as Extract<
        ProgramRebuildProgress,
        { stage: "COMPLETED" }
      >;
      onProgress?.(
        "اكتمل بنجاح: " +
          result.daysGenerated +
          " أيام و" +
          result.questionsGenerated +
          " سؤالًا.",
        result
      );
      return result;
    }

    if (stage === "EXTRACTING") {
      const progress = data as unknown as Extract<
        ProgramRebuildProgress,
        { stage: "EXTRACTING" }
      >;

      if (progress.completedPages === lastCompleted && step > 0) {
        onProgress?.(
          "لم تزد تغطية المصدر في المحاولة الأخيرة (" +
            progress.completedPages +
            "/" +
            progress.requiredPages +
            "). سأحاول دفعة أخرى…",
          progress
        );
      } else {
        onProgress?.(
          "تم استخراج " +
            progress.completedPages +
            " صفحة حقيقية من أصل " +
            progress.requiredPages +
            " مطلوبة (الملف " +
            progress.totalPages +
            " صفحة).",
          progress
        );
      }
      lastCompleted = progress.completedPages;
      continue;
    }

    throw new Error("حالة معالجة غير متوقعة من الخادم.");
  }

  throw new Error(
    "لم تكتمل معالجة الملف ضمن عدد المحاولات الآمن. التقدم المحفوظ لن يضيع؛ أعد الضغط على المعالجة لمتابعة الصفحات المتبقية."
  );
}
