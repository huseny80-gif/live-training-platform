"use client";

import { useActionState } from "react";
import { createProgram } from "@/app/actions/programs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ActionResult } from "@/app/actions/programs";

export default function NewProgramPage() {
  const [state, dispatch, isPending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    createProgram,
    null
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.push(`/programs/${state.data.id}`);
  }, [state, router]);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto bg-white rounded-2xl border p-8">
        <h1 className="text-xl font-bold mb-6">New Training Program</h1>
        <form action={dispatch} className="space-y-4">
          <Field label="Title *" name="title" required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              name="description"
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select
              name="language"
              defaultValue="AR"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="AR">Arabic</option>
              <option value="EN">English</option>
            </select>
          </div>
          {state && !state.ok && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          <div className="flex gap-3 pt-2">
            <a
  href="/dashboard"
  className="flex-1 py-2 rounded-lg border text-sm hover:bg-gray-50 text-center"
>
  Cancel
</a>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? "Creating…" : "Create Program"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        name={name}
        required={required}
        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
