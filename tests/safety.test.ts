import assert from "node:assert/strict";
import { isArabicQuestionContent, isPredominantlyArabic } from "../src/lib/language";
import { getPublicParticipantOrigin } from "../src/lib/public-origin";

assert.equal(isPredominantlyArabic("ما هو تعريف الأمن السيبراني؟"), true);
assert.equal(isPredominantlyArabic("What is cybersecurity?"), false);
assert.equal(
  isArabicQuestionContent("ما المقصود بواجهة برمجة التطبيقات API؟", [
    { text: "واجهة برمجة التطبيقات" },
    { text: "API" },
    { text: "قاعدة بيانات" },
    { text: "خادم ويب" },
  ]),
  true
);
assert.equal(
  isArabicQuestionContent("What is an API?", [
    { text: "Application Programming Interface" },
    { text: "Database" },
  ]),
  false
);

const previous = process.env.NEXT_PUBLIC_PARTICIPANT_URL;
delete process.env.NEXT_PUBLIC_PARTICIPANT_URL;
assert.equal(getPublicParticipantOrigin(), "https://live-training-platform.vercel.app");

process.env.NEXT_PUBLIC_PARTICIPANT_URL = "https://training.example.com/path/";
assert.equal(getPublicParticipantOrigin(), "https://training.example.com");

process.env.NEXT_PUBLIC_PARTICIPANT_URL = "http://training.example.com";
assert.throws(() => getPublicParticipantOrigin(), /MUST_USE_HTTPS/);

process.env.NEXT_PUBLIC_PARTICIPANT_URL = "https://live-training-platform-git-preview-husen4.vercel.app";
assert.equal(
  getPublicParticipantOrigin(),
  "https://live-training-platform.vercel.app",
  "Vercel Preview origins must never be encoded in participant QR links"
);

process.env.NEXT_PUBLIC_PARTICIPANT_URL = "https://vercel.com/husen4/live-training-platform";
assert.equal(
  getPublicParticipantOrigin(),
  "https://live-training-platform.vercel.app",
  "Vercel account/dashboard URLs must never be encoded in participant QR links"
);

if (previous === undefined) delete process.env.NEXT_PUBLIC_PARTICIPANT_URL;
else process.env.NEXT_PUBLIC_PARTICIPANT_URL = previous;

console.log("Safety tests passed");
