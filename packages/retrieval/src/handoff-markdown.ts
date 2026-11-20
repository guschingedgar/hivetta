import type { HandoffView } from "@memory/schema";

const KIND = { decision: "Decision", fact: "Fact", assumption: "Assumption", open_question: "Open question" } as const;

/** A short, stable file name for a handover: handover-2026-11-11-design-overhaul.md */
export function handoffFileName(h: HandoffView): string {
  const slug = h.title.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 40).replace(/-$/, "");
  return `handover-${h.createdAt.slice(0, 10)}${slug ? `-${slug}` : ""}.md`;
}

/** The handover as Markdown: what an AI (or a person) reads to pick the work up. */
export function handoffMarkdown(h: HandoffView, projectName?: string): string {
  const lines: string[] = [`# ${h.title}`, ""];
  const meta = [
    projectName && `**Project:** ${projectName}`,
    `**From:** ${h.provenance.author} (in ${h.provenance.client})`,
    h.recipient && `**For:** ${h.recipient}`,
    h.area && `**Area:** ${h.area}`,
    `**Date:** ${h.createdAt.slice(0, 10)}`,
  ].filter(Boolean) as string[];
  lines.push(meta.join("  \n"), "", "## Where things stand", "", h.summary.trim(), "");
  if (h.nextSteps.length) lines.push("## Next steps", "", ...h.nextSteps.map((s, i) => `${i + 1}. ${s}`), "");
  if (h.links.length) lines.push("## Where the work lives", "", ...h.links.map((l) => `- [${l.label}](${l.url})`), "");
  if (h.claims.length) {
    lines.push("## Saved with it", "");
    for (const c of h.claims) {
      const flag = c.status === "proposed" ? " _(not confirmed yet)_" : c.status === "rejected" ? " _(set aside: already in memory)_" : c.status === "superseded" ? " _(replaced since)_" : "";
      lines.push(`- **${KIND[c.type]}:** ${c.text}${flag}`);
      if (c.rationale) lines.push(`  - Why: ${c.rationale}`);
    }
    lines.push("");
  }
  lines.push("---", `_Saved in Hivetta. Ask your AI to search Hivetta for more context on any point above._`, "");
  return lines.join("\n");
}
