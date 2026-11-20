import { handoffFileName, handoffMarkdown } from "@memory/retrieval";
import { projectFor } from "@/lib/data";

/** One handover as a Markdown file: shown in the browser, or downloaded with ?download=1. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; hid: string }> }) {
  const { id, hid } = await params;
  const { store, project } = await projectFor(id);
  const h = (await store.listHandoffs(id, 100)).find((x) => x.id === hid);
  if (!h) return new Response("Handover not found", { status: 404 });
  const download = new URL(req.url).searchParams.has("download");
  return new Response(handoffMarkdown(h, project.name), {
    headers: {
      // Browsers show text/plain; some download text/markdown instead of displaying it.
      "content-type": `${download ? "text/markdown" : "text/plain"}; charset=utf-8`,
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${handoffFileName(h)}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
