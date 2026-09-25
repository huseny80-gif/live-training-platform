import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { listOwnedPrograms } from "@/app/actions/programs";
import Link from "next/link";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-green-100 text-green-800",
  ARCHIVED: "bg-gray-100 text-gray-600",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const programs = await listOwnedPrograms();
  const totalQuestions = programs.reduce(
    (sum, p) => sum + p.days.reduce((s, d) => s + d._count.questions, 0),
    0
  );

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Live Training Platform</h1>
          <p className="text-sm text-gray-500">Welcome, {session.user.name ?? session.user.email}</p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Sign Out
          </button>
        </form>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Programs" value={programs.length} />
          <StatCard
            label="Total Days"
            value={programs.reduce((s, p) => s + p._count.days, 0)}
          />
          <StatCard label="Total Questions" value={totalQuestions} />
        </div>

        {/* Programs list */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Training Programs</h2>
          <Link
            href="/programs/new"
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + New Program
          </Link>
        </div>

        {programs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            No programs yet. Create your first one.
          </div>
        ) : (
          <div className="space-y-3">
            {programs.map((p) => {
              const qCount = p.days.reduce((s, d) => s + d._count.questions, 0);
              return (
                <Link
                  key={p.id}
                  href={`/programs/${p.id}`}
                  className="block bg-white rounded-xl border p-4 hover:border-blue-400 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.title}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[p.status] ?? ""}`}
                        >
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                        <span className="text-xs text-gray-400">{p.language}</span>
                      </div>
                      {p.description && (
                        <p className="text-sm text-gray-500 line-clamp-1">{p.description}</p>
                      )}
                    </div>
                    <div className="flex gap-4 text-sm text-gray-500 shrink-0 ml-4">
                      <span>{p._count.days} day{p._count.days !== 1 ? "s" : ""}</span>
                      <span>{qCount} Q</span>
                      <span>{p._count.sessions} session{p._count.sessions !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}
