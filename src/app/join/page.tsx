"use client";

import { useActionState } from "react";
import { joinSessionAction } from "@/app/actions/sessions";

const ERROR_MESSAGES: Record<string, string> = {
  SESSION_NOT_FOUND:    "Session code not found. Check the code and try again.",
  SESSION_NOT_STARTED:  "The instructor hasn't started this session yet. Wait and try again.",
  SESSION_ENDED:        "This session has already ended.",
  JOIN_DEADLINE_PASSED: "The join window for this session has closed.",
  INVALID_DISPLAY_NAME: "Name must be 2–50 characters.",
  MISSING_FIELDS:       "Please enter both a session code and your name.",
};

type State = { error: string } | null;

export default function JoinPage() {
  const [state, action, isPending] = useActionState<State, FormData>(
    async (_prev: State, formData: FormData) => {
      try {
        await joinSessionAction(formData);
        return null; // redirect happens inside the action — this line never runs
      } catch (err) {
        const msg = err instanceof Error ? err.message : "UNKNOWN_ERROR";
        // NEXT_REDIRECT is not an error — let it propagate
        if (msg.includes("NEXT_REDIRECT")) throw err;
        return { error: msg };
      }
    },
    null
  );

  const errorText = state?.error
    ? (ERROR_MESSAGES[state.error] ?? `Error: ${state.error}`)
    : null;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Join Quiz</h1>
          <p className="text-sm text-gray-500 mt-1">Enter the session code your instructor shared</p>
        </div>

        <form action={action} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session Code</label>
            <input
              name="code"
              required
              autoComplete="off"
              placeholder="e.g. A3F2B1"
              className="w-full rounded-lg border px-3 py-2.5 text-center font-mono text-lg tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
            <input
              name="name"
              required
              autoComplete="name"
              placeholder="Enter your name"
              className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              minLength={2}
              maxLength={50}
            />
          </div>

          {errorText && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorText}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "Joining…" : "Join Session"}
          </button>
        </form>
      </div>
    </main>
  );
}
