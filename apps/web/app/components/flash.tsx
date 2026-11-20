/** Renders ?error= and ?notice= messages set by server actions. */
export function Flash({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return (
    <div className="stack" style={{ marginBottom: 20 }}>
      {error && <p className="flash flash-error" role="alert">{error}</p>}
      {notice && <p className="flash flash-notice" role="status">{notice}</p>}
    </div>
  );
}
