/** Normalised failure from the database, so callers never see PostgREST shapes. */
export type StoreErrorCode =
  | "forbidden" // RLS or privilege denial
  | "invalid" // a constraint or check rejected the data
  | "not_found"
  | "conflict" // unique violation
  | "unavailable"; // network, timeout, anything unexpected

export class StoreError extends Error {
  constructor(
    readonly code: StoreErrorCode,
    message: string,
    readonly pgCode?: string,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

const PG_CODES: Record<string, StoreErrorCode> = {
  "42501": "forbidden", // insufficient_privilege, RLS, our triggers
  "23514": "invalid", // check_violation, lifecycle triggers
  "23502": "invalid", // not_null_violation
  "23503": "invalid", // foreign_key_violation (incl. cross-project)
  "22023": "invalid", // invalid_parameter_value
  "22P02": "invalid", // invalid_text_representation (bad uuid)
  "23505": "conflict",
  PGRST116: "not_found",
};

export function toStoreError(err: { code?: string; message: string } | null | undefined): StoreError {
  if (!err) return new StoreError("unavailable", "unknown database error");
  const code = (err.code ? PG_CODES[err.code] : undefined) ?? "unavailable";
  return new StoreError(code, err.message, err.code);
}
