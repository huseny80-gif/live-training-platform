import assert from "node:assert/strict";
import vm from "node:vm";
import { buildGoogleFormScript } from "../src/lib/google-forms";
import { selectFinalQuestions } from "../src/lib/final-exam";
const questions = [{ text: 'السؤال "الأول"؟\nهل يعمل؟', explanation: "التفسير الصحيح", options: [{ text: "نعم", correct: true }, { text: "لا", correct: false }] }];
const items: any[] = []; const logs: string[] = [];
const form = { setIsQuiz(value: boolean) { assert.equal(value, true); }, setDescription() {}, addMultipleChoiceItem() {
  const item = { title: "", choices: [] as unknown[], setTitle(title: string) { this.title = title; return this; }, setRequired(v: boolean) { assert.equal(v, true); return this; }, setPoints(v: number) { assert.equal(v, 1); return this; }, createChoice(text: string, correct: boolean) { return { text, correct }; }, setChoices(choices: unknown[]) { this.choices = choices; }, setFeedbackForCorrect() {}, setFeedbackForIncorrect() {} }; items.push(item); return item;
}, getEditUrl() { return "edit-url"; }, getPublishedUrl() { return "share-url"; } };
const context = vm.createContext({ FormApp: { create(title: string) { assert.equal(title, 'اختبار "; throw new Error("injected"); //'); return form; }, createFeedback() { return { setText() { return { build() { return {}; } }; } }; } }, Logger: { log(value: string) { logs.push(value); } } });
vm.runInContext(buildGoogleFormScript('اختبار "; throw new Error("injected"); //', questions), context);
assert.equal(vm.runInContext("createTrainingQuiz()", context), "edit-url");
assert.equal(items[0].title, questions[0].text); assert.equal(items[0].choices[0].correct, true); assert.equal(items[0].choices[1].correct, false); assert.equal(logs.length, 2);
assert.throws(() => buildGoogleFormScript("test", []), /INVALID_FORM/);
assert.throws(() => buildGoogleFormScript("test", [{ ...questions[0], options: questions[0].options.map(o => ({ ...o, correct: false })) }]), /INVALID_FORM/);
assert.deepEqual(selectFinalQuestions([{ questions: ["day1-a", "day1-b"] }, { questions: ["day2-a", "day2-b"] }], 3), ["day1-a", "day2-a", "day1-b"]);
assert.throws(() => selectFinalQuestions([{ questions: [1] }], 2), /NOT_ENOUGH/);
assert.throws(() => selectFinalQuestions([], 0), /INVALID_QUESTION/);
console.log("Google Forms and final exam selection: 6 passed (local Apps Script simulation; no Google account access)");
