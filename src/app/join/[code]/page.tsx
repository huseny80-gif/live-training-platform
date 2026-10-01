import JoinForm from "@/components/participant/JoinForm";

export default async function JoinWithCodePage({ params }: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <JoinForm code={code} />;
}
