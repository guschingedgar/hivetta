import OpenAI from "openai";

/** Must match the vector(N) column in the claims table. */
export const EMBEDDING_DIMENSIONS = 1536;

export interface Embedder {
  /** Stored next to every vector, so a future model change can re-embed selectively. */
  readonly model: string;
  /** One vector (or null in keyword-only mode) per input, in input order. */
  embed(texts: readonly string[]): Promise<Array<number[] | null>>;
}

export class EmbeddingUnavailableError extends Error {
  constructor(cause: unknown) {
    super("embedding service unavailable", { cause });
    this.name = "EmbeddingUnavailableError";
  }
}

export function createOpenAIEmbedder(opts: { apiKey: string; model?: string }): Embedder {
  const client = new OpenAI({ apiKey: opts.apiKey, maxRetries: 2, timeout: 15_000 });
  const model = opts.model ?? "text-embedding-3-small";
  return {
    model,
    async embed(texts) {
      if (texts.length === 0) return [];
      try {
        const res = await client.embeddings.create({
          model,
          input: [...texts],
          dimensions: EMBEDDING_DIMENSIONS,
        });
        // The API returns items tagged with their input index; do not assume order.
        return [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
      } catch (err) {
        throw new EmbeddingUnavailableError(err);
      }
    },
  };
}

/** Embedder from the environment: OpenAI when OPENAI_API_KEY is set. */
export function embedderFromEnv(env: Record<string, string | undefined> = process.env): Embedder {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return createOpenAIEmbedder({ apiKey, model: env.EMBEDDING_MODEL });
}

/** Free mode: claims retain provenance and full-text search without a vector. */
export function createKeywordOnlyEmbedder(): Embedder {
  return {
    model: "keyword-only",
    async embed(texts) {
      return texts.map(() => null);
    },
  };
}

/**
 * Deterministic, offline embedder for tests: hashed bag of words, normalised.
 * Texts sharing words get similar vectors, which is enough to exercise ranking.
 */
export function createFakeEmbedder(dimensions = EMBEDDING_DIMENSIONS): Embedder {
  return {
    model: "fake-hash-v1",
    async embed(texts) {
      return texts.map((t) => {
        const v = new Array<number>(dimensions).fill(0);
        for (const word of t.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
          let h = 2166136261;
          for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619);
          v[(h >>> 0) % dimensions]! += 1;
        }
        const norm = Math.hypot(...v) || 1;
        return v.map((x) => x / norm);
      });
    },
  };
}
