"use client";

import { useActionState } from "react";
import { createDay } from "@/app/actions/days";
import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import type { ActionResult } from "@/app/actions/programs";

export default function AddDayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    createDay,
    null
  );

  useEffect(() => {
    if (state?.ok) router.push(`/programs/${params.id}`);
  }, [state, router, params.id]);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto bg-white rounded-2xl border p-8">
        <h1 className="text-xl font-bold mb-6">Add Training Day</h1>
        <form action={dispatch} className="space-y-4">
          <input type="hidden" name="programId" value={params.id} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Day Number (1–10) *</label>
            <input
              name="dayNumber"
              type="number"
              min={1}
              max={10}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              name="title"
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Objectives (one per line)
            </label>
            <textarea
              name="objectives"
              rows={4}
              placeholder="Understand X&#10;Apply Y&#10;Analyze Z"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content Summary</label>
            <textarea
              name="contentSummary"
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {state && !state.ok && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 py-2 rounded-lg border text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? "Adding…" : "Add Day"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
