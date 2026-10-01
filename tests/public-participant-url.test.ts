import assert from "node:assert/strict";
import {
  buildParticipantJoinUrl,
  getPublicParticipantOrigin,
  PUBLIC_PARTICIPANT_ORIGIN,
} from "../src/lib/public-participant-url";

assert.equal(
  getPublicParticipantOrigin("https://live-training-platform.vercel.app/"),
  "https://live-training-platform.vercel.app",
);

assert.equal(
  getPublicParticipantOrigin("https://live-training-platform-git-test-husen4.vercel.app"),
  PUBLIC_PARTICIPANT_ORIGIN,
  "Vercel preview domains must never be encoded into public QR links",
);

assert.equal(
  getPublicParticipantOrigin("https://training.example.org/some/path?x=1"),
  "https://training.example.org",
);

assert.equal(
  buildParticipantJoinUrl("a1b2c3", "https://training.example.org"),
  "https://training.example.org/join/A1B2C3",
);

assert.throws(() => buildParticipantJoinUrl("BAD"), /INVALID_SESSION_CODE/);

console.log("✓ public participant URL tests passed");
