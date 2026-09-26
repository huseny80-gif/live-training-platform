import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDay } from "@/app/actions/days";

export default async function DayDetailsPage({
  params,
}: {
  params: Promise<{ id: string; dayId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id, dayId } = await params;

  let day;
  try {
    day = await getDay(dayId);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  }

  if (day.programId !== id) notFound();

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href={`/programs/${id}`} className="text-sm text-gray-600">
          ← Back to Program
        </Link>

        <section className="bg-white rounded-2xl border p-8">
          <p className="text-sm text-gray-500">Day {day.dayNumber}</p>
          <h1 className="text-2xl font-bold mt-1">{day.title}</h1>
          <p className="mt-4 text-sm">Status: {day.status}</p>
          <p className="mt-2 text-sm">Questions: {day._count.questions}</p>
        </section>

        <section className="bg-white rounded-2xl border p-8">
          <h2 className="text-lg font-semibold">Objectives</h2>
          <ul className="mt-4 space-y-2">
            {day.objectives.map((objective, index) => (
              <li key={index}>
                {index + 1}. {objective}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-2xl border p-8">
          <h2 className="text-lg font-semibold">Content Summary</h2>
          <p className="mt-4 whitespace-pre-wrap">
            {day.contentSummary || "No content summary added."}
          </p>
        </section>

        <section className="bg-white rounded-2xl border p-8">
          <h2 className="text-lg font-semibold">Topics</h2>

          {day.topics.length > 0 ? (
            <div className="mt-4 space-y-2">
              {day.topics.map((topic) => (
                <div key={topic.id} className="border rounded-lg p-3">
                  {topic.topicOrder}. {topic.title}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-gray-500">
              No topics generated yet.
            </p>
          )}
        </section>

        <Link
          href={`/programs/${id}`}
          className="inline-block px-4 py-2 border rounded-lg bg-white"
        >
          ← Back to Program
        </Link>
      </div>
    </main>
  );
}