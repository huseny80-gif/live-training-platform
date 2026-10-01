import type { AIAdapter, ContentGenerationRequest, ContentGenerationResult, GeneratedDayPlan, GeneratedQuestion } from "../types";
import { buildDayPlanPrompt, buildQuestionsPrompt, PROMPT_VERSION } from "../prompts";
import { isArabicQuestionContent } from "@/lib/language";

const MODEL_ID = process.env.OPENAI_MODEL || "gpt-5.6-luna";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

async function respond(prompt: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY env var not set");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL_ID, input: prompt }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OPENAI_API_ERROR_${response.status}: ${body.slice(0, 500)}`);
  }
  const data = await response.json() as OpenAIResponse;
  const text = data.output_text ?? data.output?.flatMap(o => o.content ?? []).filter(c => c.type === "output_text").map(c => c.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("OPENAI_EMPTY_RESPONSE");
  return { text, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };
}

export class OpenAIAdapter implements AIAdapter {
  readonly name = "OPENAI";
  readonly modelId = MODEL_ID;

  async generate(req: ContentGenerationRequest): Promise<ContentGenerationResult> {
    let inputTokens = 0, outputTokens = 0;
    const plan = await respond(buildDayPlanPrompt(req.pages, req.programTitle, req.language, req.totalDays));
    inputTokens += plan.inputTokens; outputTokens += plan.outputTokens;
    const days = parseDayPlans(plan.text, req.totalDays);
    const questions: GeneratedQuestion[] = [];
    for (const day of days) {
      const q = await respond(buildQuestionsPrompt(day, req.pages, req.language, req.questionsPerDay, questions.map(x => x.questionText)));
      inputTokens += q.inputTokens; outputTokens += q.outputTokens;
      questions.push(...parseQuestions(q.text, day.dayNumber, req.questionsPerDay));
    }
    if (req.language === "AR") {
      const invalid = questions.filter(
        (question) => !isArabicQuestionContent(question.questionText, question.options)
      );
      if (invalid.length > 0) {
        throw new Error(`AI_LANGUAGE_MISMATCH_AR:${invalid.length}`);
      }
    }
    return { days, questions, modelUsed: MODEL_ID, promptVersion: PROMPT_VERSION, inputTokens, outputTokens, generatedAt: new Date() };
  }
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.search(/[{[]/), end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (start < 0 || end < 0) throw new Error("No JSON found in AI response");
  return JSON.parse(raw.slice(start, end + 1));
}
function parseDayPlans(text: string, totalDays: number): GeneratedDayPlan[] {
  const parsed = extractJson(text) as { days?: unknown[] };
  if (!Array.isArray(parsed.days)) throw new Error("INVALID_DAY_PLAN");
  return parsed.days.slice(0,totalDays).map((d,i) => {
    const x=d as Record<string,unknown>;
    return { dayNumber: typeof x.dayNumber==="number"?x.dayNumber:i+1, title:String(x.title??`اليوم ${i+1}`), objectives:Array.isArray(x.objectives)?x.objectives as string[]:[], contentSummary:String(x.contentSummary??""), topics:Array.isArray(x.topics)?x.topics as string[]:[], pageRangeStart:Number(x.pageRangeStart), pageRangeEnd:Number(x.pageRangeEnd), sourcePages:Array.isArray(x.sourcePages)?x.sourcePages as number[]:[] };
  });
}
function parseQuestions(text:string, dayNumber:number, limit:number):GeneratedQuestion[] {
  const parsed=extractJson(text) as {questions?:unknown[]};
  if(!Array.isArray(parsed.questions)) throw new Error("INVALID_QUESTIONS");
  return parsed.questions.slice(0,limit).map((q,i)=>{
    const x=q as Record<string,unknown>, opts=Array.isArray(x.options)?x.options as Array<Record<string,string>>:[];
    const label=(["A","B","C","D"].includes(String(x.correctLabel))?String(x.correctLabel):"A") as "A"|"B"|"C"|"D";
    return {questionText:String(x.questionText??""),options:(["A","B","C","D"] as const).map(l=>({label:l,text:String(opts.find(o=>o.label===l)?.text??"")})),correctLabel:label,explanation:String(x.explanation??""),dayNumber,questionOrder:typeof x.questionOrder==="number"?x.questionOrder:i+1,sourcePageNumber:Number(x.sourcePageNumber),topic:typeof x.topic==="string"?x.topic:undefined,difficulty:["EASY","MEDIUM","HARD"].includes(String(x.difficulty))?x.difficulty as "EASY"|"MEDIUM"|"HARD":"MEDIUM"};
  }).filter(q=>q.questionText.length>0 && Number.isFinite(q.sourcePageNumber) && q.options.every(o=>o.text.length>0));
}
