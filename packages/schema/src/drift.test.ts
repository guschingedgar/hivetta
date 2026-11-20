import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRANCH_STATUSES,
  CLAIM_STATUSES,
  CLAIM_TYPES,
  CONFLICT_STATUSES,
  EDGE_CREATORS,
  EDGE_TYPES,
  MEMBER_ROLES,
  MESSAGE_ROLES,
} from "./enums";

// One definition, two enforcement points: Zod at the edge, CHECK in Postgres.
// This test is what keeps them the same definition.

const migrationsDir = join(import.meta.dirname, "../../../supabase/migrations");
const sql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

/** Every value list in `check (<column> in ('a', 'b'))` for the given column. */
function checkLists(column: string): string[][] {
  const re = new RegExp(`check \\(${column} in \\(([^)]*)\\)\\)`, "g");
  return [...sql.matchAll(re)].map((m) =>
    m[1]!.split(",").map((v) => v.trim().replace(/^'|'$/g, "")),
  );
}

describe("SQL CHECK constraints match the Zod enums", () => {
  it.each([
    ["type", [CLAIM_TYPES, EDGE_TYPES]],
    ["status", [CLAIM_STATUSES, CONFLICT_STATUSES, BRANCH_STATUSES]],
    ["role", [MEMBER_ROLES, MESSAGE_ROLES]],
    ["created_by", [EDGE_CREATORS]],
  ] as const)("column %s", (column, enums) => {
    const lists = checkLists(column);
    expect(lists.length).toBeGreaterThan(0);
    for (const list of lists) {
      // The first migration is immutable; a later migration extends claim status.
      const historicalClaimStatuses = ["proposed", "accepted", "rejected", "superseded"];
      if (column === "status" && [...list].sort().join() === historicalClaimStatuses.sort().join()) continue;
      expect(enums.map((e) => [...e].sort())).toContainEqual([...list].sort());
    }
  });

  it("covers every enum at least once", () => {
    const all = ["type", "status", "role", "created_by"].flatMap(checkLists).map((l) => [...l].sort().join());
    for (const e of [BRANCH_STATUSES, CLAIM_TYPES, CLAIM_STATUSES, MEMBER_ROLES, MESSAGE_ROLES, EDGE_TYPES, EDGE_CREATORS, CONFLICT_STATUSES]) {
      expect(all).toContain([...e].sort().join());
    }
  });
});
