import { redirect } from "next/navigation";

// A shareable link to one memory: opens the memory page with its panel.
export default async function MemoryLink({ params }: { params: Promise<{ id: string; claimId: string }> }) {
  const { id, claimId } = await params;
  redirect(`/projects/${id}/memory?m=${encodeURIComponent(claimId)}`);
}
