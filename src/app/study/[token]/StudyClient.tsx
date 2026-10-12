"use client";
import { useEffect, useReducer, useRef } from "react";
import type { StudentMaterial, GapReport } from "@/lib/exam-material/grounding";
import { SummaryView, ConceptView, CitationView } from "@/app/exam-material/MaterialView";

type State = { tab: "summary" | "map" | "quiz"; answers: Record<string, number>; pending: boolean; report: GapReport | null; error: string };
type Event = { type: "TAB"; tab: State["tab"] } | { type: "ANSWER"; id: string; value: number } | { type: "PENDING" } | { type: "REPORT"; report: GapReport } | { type: "ERROR"; message: string } | { type: "RESET" };
const initial: State = { tab: "summary", answers: {}, pending: false, report: null, error: "" };
function reducer(state: State, event: Event): State {
  switch(event.type) {
    case "TAB": return { ...state, tab: event.tab };
    case "ANSWER": return state.pending || state.report ? state : { ...state, answers: { ...state.answers, [event.id]: event.value }, error: "" };
    case "PENDING": return { ...state, pending: true, error: "" };
    case "REPORT": return { ...state, pending: false, report: event.report, error: "" };
    case "ERROR": return { ...state, pending: false, error: event.message };
    case "RESET": return { ...initial, tab: "quiz" };
  }
}
export default function StudyClient({ token, content }: { token: string; content: StudentMaterial }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const hasAttempt = useRef(false);
  const loaded = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/study/${token}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("تعذّر تحميل الاختبار أو أُلغي نشره.");
      const data = await response.json(); hasAttempt.current = data.hasAttempt; loaded.current = true;
      if (data.report) dispatch({ type: "REPORT", report: data.report });
    }).catch(error => { if (!controller.signal.aborted) dispatch({ type: "ERROR", message: error.message }); });
    return () => controller.abort();
  }, [token]);
  async function request(body: unknown) {
    const response = await fetch(`/api/study/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error); return data;
  }
  async function submit() {
    if (!loaded.current) { dispatch({ type: "ERROR", message: "لم يكتمل تحميل الاختبار. أعد تحميل الصفحة ثم حاول مجددًا." }); return; }
    if (Object.keys(state.answers).length !== content.questions.length) { dispatch({ type: "ERROR", message: "أجب عن جميع الأسئلة أولاً." }); return; }
    dispatch({ type: "PENDING" });
    try {
      if (!hasAttempt.current) { await request({ mode: "start" }); hasAttempt.current = true; }
      const data = await request({ mode: "submit", answers: state.answers });
      dispatch({ type: "REPORT", report: data.report });
    } catch(e) { dispatch({ type: "ERROR", message: e instanceof Error ? e.message : "تعذّر تسليم الإجابات." }); }
  }
  return <>
    <nav className="em-tabs" aria-label="أقسام المادة">{([["summary", "الملخص"], ["map", "خريطة المفاهيم"], ["quiz", "الاختبار التفاعلي"]] as const).map(([tab, label]) => <button key={tab} className={state.tab === tab ? "active" : ""} aria-pressed={state.tab === tab} onClick={() => dispatch({ type: "TAB", tab })}>{label}</button>)}</nav>
    {state.tab === "summary" && <SummaryView content={content} token={token}/>}
    {state.tab === "map" && <ConceptView content={content} token={token}/>}
    {state.error && <p className="em-glass em-pad em-error" role="alert">{state.error}</p>}
    {state.tab === "quiz" && <section className="em-stack">
      {!state.report ? <form className="em-stack" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <div><h2>اختبر فهمك للنص الأصلي</h2><p className="em-muted">أكمل كل نص مقتبس بالعبارة التي وردت في المحاضرة. {Object.keys(state.answers).length} / {content.questions.length} إجابة</p><progress value={Object.keys(state.answers).length} max={content.questions.length} aria-label="تقدم الإجابة"/></div>
        {content.questions.map((q, index) => <fieldset className="em-glass em-pad em-stack" key={q.id} disabled={state.pending}><legend>السؤال {index + 1}</legend><p className="em-prompt">{q.prompt}</p>
          {q.options.map((text, i) => <label className={`em-option ${state.answers[q.id] === i ? "selected" : ""}`} key={i}><input type="radio" name={q.id} required checked={state.answers[q.id] === i} onChange={() => dispatch({ type: "ANSWER", id: q.id, value: i })}/><span>{text}</span></label>)}
        </fieldset>)}
        <button className="em-button" disabled={state.pending}>{state.pending ? "تحليل الإجابات وربطها بالمحاضرات…" : "إنهاء الاختبار وعرض الثغرات المعرفية"}</button>
      </form> : <div className="em-stack" aria-live="polite">
        <section className="em-glass em-pad"><span className="em-kicker">نتيجتك</span><h2><bdi dir="ltr">{state.report.correct} / {state.report.total}</bdi></h2><p>نسبة الإجابات الصحيحة: {Math.round(state.report.correct / state.report.total * 100)}٪</p></section>
        <h2>كاشف الثغرات المعرفية</h2><p className="em-muted">هذه مواضع المراجعة المرتبطة بإجاباتك الخاطئة، وليست حكمًا عامًا على قدراتك.</p>
        {state.report.gaps.length === 0 && <p className="em-glass em-pad em-correct">أجبت عن جميع الأسئلة بصورة صحيحة. يمكنك مراجعة المقاطع لتعزيز فهمك.</p>}
        {state.report.gaps.map(g => <article key={g.questionId} className="em-glass em-pad em-stack"><span className="em-kicker">مفهوم يحتاج إلى مراجعة</span><h3>{g.concept}</h3><blockquote>{g.citation.text}</blockquote><CitationView citation={g.citation} token={token}/></article>)}
        <details className="em-glass em-pad"><summary>مراجعة جميع الإجابات</summary>{state.report.details.map(d => <article key={d.questionId} className="em-review"><p>{d.prompt}</p><p className={d.correct ? "em-correct" : "em-error"}>{d.correct ? "✓ صحيح" : "إجابة تحتاج إلى مراجعة"} · إجابتك: {d.selected}</p><p>العبارة الأصلية: {d.answer}</p><CitationView citation={d.citation} token={token}/></article>)}</details>
        <button className="em-button em-secondary" disabled={state.pending} onClick={async () => {
          dispatch({ type: "PENDING" });
          try { await request({ mode: "start" }); hasAttempt.current = true; dispatch({ type: "RESET" }); }
          catch(e) { dispatch({ type: "ERROR", message: e instanceof Error ? e.message : "تعذّر بدء المحاولة." }); }
        }}>بدء محاولة تعلم جديدة</button>
      </div>}
    </section>}
  </>;
}
