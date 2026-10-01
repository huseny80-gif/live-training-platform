"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { runProgramRebuild } from "@/lib/client/program-rebuild";

export default function AutoProgramRecovery({
  programId,
  enabled,
}: {
  programId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;

    async function recover() {
      setStatus("running");
      setMessage(
        "تم اكتشاف بنك أسئلة فارغ. جارٍ إصلاح مصدر PDF الحقيقي تلقائيًا ثم إنشاء 10 أيام و50 سؤالًا بالعربية…"
      );

      try {
        const result = await runProgramRebuild({
          programId,
          onProgress: (text) => setMessage(text),
        });

        if (result.daysGenerated !== 10 || result.questionsGenerated !== 50) {
          throw new Error(
            `لم يكتمل العدد الإلزامي: ${result.daysGenerated} أيام و${result.questionsGenerated} سؤالًا.`
          );
        }

        setStatus("success");
        setMessage("اكتمل الإصلاح: 10 أيام و50 سؤالًا عربيًا. جارٍ تحديث الصفحة…");
        router.refresh();
      } catch (error) {
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "تعذر إكمال الإصلاح التلقائي."
        );
      }
    }

    void recover();
  }, [enabled, programId, router]);

  if (!enabled && status === "idle") return null;
  if (status === "idle") return null;

  return (
    <section
      className={`brand-card dlp-auto-recovery ${status}`}
      role={status === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <strong>
        {status === "running"
          ? "إصلاح تلقائي جارٍ"
          : status === "success"
          ? "اكتمل الإصلاح"
          : "تعذر الإصلاح التلقائي"}
      </strong>
      <p>{message}</p>
    </section>
  );
}
