import JoinForm from "@/components/participant/JoinForm";

export default async function JoinPage({ searchParams }: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { code } = await searchParams;
  return <JoinForm code={typeof code === "string" ? code : undefined} />;
}
