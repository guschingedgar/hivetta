import { describe, expect, it } from "vitest";
import { validateBatch } from "./validate";

const good = { text: "The billing service uses Stripe Checkout to keep PCI scope minimal.", type: "decision" };

function reasonsFor(item: unknown): string[] {
  const { rejected } = validateBatch([item]);
  return rejected[0]?.reasons ?? [];
}

describe("validateBatch: schema", () => {
  it("accepts a well-formed claim and trims its text", () => {
    const { accepted, rejected } = validateBatch([{ ...good, text: `  ${good.text}  `, confidence: 0.8 }]);
    expect(rejected).toEqual([]);
    expect(accepted).toEqual([{ index: 0, claim: { ...good, confidence: 0.8 } }]);
  });

  it.each([
    ["missing text", { type: "fact" }, "text"],
    ["non-string text", { text: 42, type: "fact" }, "text"],
    ["text under 8 chars", { text: "Too sh.", type: "fact" }, "text"],
    ["text over 2000 chars", { text: `${"word ".repeat(401)}.`, type: "fact" }, "text"],
    ["unknown type", { ...good, type: "idea" }, "type"],
    ["missing type", { text: good.text }, "type"],
    ["confidence above 1", { ...good, confidence: 1.5 }, "confidence"],
    ["confidence below 0", { ...good, confidence: -0.1 }, "confidence"],
  ])("rejects %s with a reason naming the field", (_label, item, field) => {
    const reasons = reasonsFor(item);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.some((r) => r.startsWith(`${field}:`))).toBe(true);
  });

  it.each([null, "a string", 7, []])("rejects a non-object item (%j)", (item) => {
    expect(reasonsFor(item).length).toBeGreaterThan(0);
  });
});

describe("validateBatch: quality rules", () => {
  it.each(["It was decided to use Postgres for storage.", "This service handles all of billing.", "They agreed on a two week sprint cadence."])(
    "rejects a dangling reference at the start: %s",
    (text) => {
      expect(reasonsFor({ text, type: "fact" }).join()).toMatch(/cannot resolve/);
    },
  );

  it("does not flag words that merely begin with a pronoun", () => {
    expect(reasonsFor({ text: "Items over 5kg ship by freight, never by post.", type: "fact" })).toEqual([]);
    expect(reasonsFor({ text: "Theme tokens live in the design-system package.", type: "fact" })).toEqual([]);
  });

  it("accepts 'we' as the team", () => {
    expect(reasonsFor({ text: "We ship the mobile app every second Tuesday.", type: "decision" })).toEqual([]);
  });

  it.each(["As discussed above, the API stays REST.", "The cache TTL is 5 minutes, as you said.", "Earlier in this conversation the team picked Vercel."])(
    "rejects references to the conversation: %s",
    (text) => {
      expect(reasonsFor({ text, type: "fact" }).join()).toMatch(/teammates cannot see/);
    },
  );

  it("requires open questions to end with '?'", () => {
    expect(reasonsFor({ text: "Whether to support SSO for the free tier.", type: "open_question" }).join()).toMatch(/ending in '\?'/);
    expect(reasonsFor({ text: "Should the free tier support SSO?", type: "open_question" })).toEqual([]);
  });

  it("rejects a question typed as something else", () => {
    expect(reasonsFor({ text: "Should we move the API to GraphQL?", type: "decision" }).join()).toMatch(/Use type open_question/);
  });

  it("rejects text too short to stand alone", () => {
    expect(reasonsFor({ text: "Postgres-everywhere.", type: "decision" }).join()).toMatch(/Too short/);
  });

  it("reports every problem with a claim, not just the first", () => {
    expect(reasonsFor({ text: "It is as discussed above?", type: "decision" })).toHaveLength(3);
  });
});

describe("validateBatch: batches", () => {
  it("keeps going past bad items and reports their original indexes", () => {
    const { accepted, rejected } = validateBatch([
      good,
      { text: "nope", type: "fact" },
      { text: "Should the free tier support SSO?", type: "open_question" },
      { text: good.text, type: "bogus" },
    ]);
    expect(accepted.map((a) => a.index)).toEqual([0, 2]);
    expect(rejected.map((r) => r.index)).toEqual([1, 3]);
    expect(rejected[1]!.text).toBe(good.text);
  });

  it("rejects later duplicates, ignoring case, spacing and trailing punctuation", () => {
    const { accepted, rejected } = validateBatch([
      good,
      { ...good, text: good.text.toUpperCase().replace(/ /g, "  ").replace(/\.$/, "") },
    ]);
    expect(accepted.map((a) => a.index)).toEqual([0]);
    expect(rejected[0]).toMatchObject({ index: 1, reasons: ["Duplicate of claim 0 in this batch."] });
  });

  it("does not count a rejected claim as the original of a later duplicate", () => {
    const bad = { text: "This is the cache policy for the API.", type: "fact" };
    const { accepted } = validateBatch([bad, { ...bad, text: "The cache policy for the API is 5 minutes." }]);
    expect(accepted.map((a) => a.index)).toEqual([1]);
  });

  it("returns empty results for an empty batch", () => {
    expect(validateBatch([])).toEqual({ accepted: [], rejected: [] });
  });
});
