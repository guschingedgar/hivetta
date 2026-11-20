import { ProposedClaim } from "@memory/schema";

export interface Rejection {
  /** Position in the submitted batch, so the caller can match it up. */
  index: number;
  text: string | null;
  reasons: string[];
}

export interface ValidatedBatch {
  accepted: { index: number; claim: ProposedClaim }[];
  rejected: Rejection[];
}

// A claim that opens with one of these depends on context the reader lacks.
const DANGLING_START =
  /^(it|its|this|that|these|those|they|them|he|she|the above|the former|the latter|same)\b/i;

// Pointers back into a conversation no teammate can see.
const CONVERSATION_REF =
  /\b(as (discussed|mentioned|agreed|said)( above| earlier| before)?|in this (conversation|chat|thread)|earlier in (this|the) (conversation|chat)|you (said|mentioned|suggested)|i (said|mentioned|suggested))\b/i;

/** Lowercased, whitespace-collapsed, trailing punctuation dropped. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[.!?;:,\s]+$/, "").trim();
}

function qualityProblems(claim: ProposedClaim): string[] {
  const problems: string[] = [];
  const { text, type } = claim;

  const dangling = DANGLING_START.exec(text);
  if (dangling) {
    problems.push(
      `Starts with "${dangling[0]}", which a teammate without this conversation cannot resolve. ` +
        "Name the subject explicitly.",
    );
  }
  const ref = CONVERSATION_REF.exec(text);
  if (ref) {
    problems.push(
      `Refers to the conversation ("${ref[0]}"), which teammates cannot see. State the content itself.`,
    );
  }
  if (text.split(/\s+/).length < 3) {
    problems.push("Too short to stand alone: write a full sentence.");
  }
  if (type === "open_question" && !text.endsWith("?")) {
    problems.push("An open_question must be phrased as a question ending in '?'.");
  }
  if (type !== "open_question" && text.endsWith("?")) {
    problems.push(`Phrased as a question but typed "${type}". Use type open_question, or state it as a ${type}.`);
  }
  return problems;
}

/**
 * Strict, per-item validation. Pure: no I/O, so it is unit tested directly.
 * One bad claim is reported and skipped; it never sinks the batch.
 */
export function validateBatch(items: readonly unknown[]): ValidatedBatch {
  const accepted: ValidatedBatch["accepted"] = [];
  const rejected: Rejection[] = [];
  const seen = new Map<string, number>();

  items.forEach((item, index) => {
    const rawText =
      typeof item === "object" && item !== null && typeof (item as { text?: unknown }).text === "string"
        ? (item as { text: string }).text
        : null;

    const parsed = ProposedClaim.safeParse(item);
    if (!parsed.success) {
      rejected.push({
        index,
        text: rawText,
        reasons: parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)),
      });
      return;
    }

    const problems = qualityProblems(parsed.data);
    const key = normalise(parsed.data.text);
    const firstIndex = seen.get(key);
    if (firstIndex !== undefined) problems.push(`Duplicate of claim ${firstIndex} in this batch.`);

    if (problems.length) {
      rejected.push({ index, text: parsed.data.text, reasons: problems });
    } else {
      seen.set(key, index);
      accepted.push({ index, claim: parsed.data });
    }
  });

  return { accepted, rejected };
}
