import type { ClaimView } from "@memory/schema";
import type { ConflictView } from "@memory/store";
import { resolveConflict } from "@/app/actions";
import { Provenance, StatusChip, TypeChip, when } from "@/app/components/ui";

function Side({ claim, label, canDecide }: { claim: ClaimView | null; label: string; canDecide: boolean }) {
  if (!claim) return <div className="side muted small">This memory is no longer visible.</div>;
  return (
    <div className="side">
      <div className="row">
        <span className="faint xs" style={{ fontWeight: 600 }}>{label}</span>
        <TypeChip type={claim.type} />
        <StatusChip status={claim.status} />
      </div>
      <p className="claim-text">{claim.text}</p>
      <Provenance p={claim.provenance} at={claim.provenance.recordedAt} />
      {canDecide && (
        <button className="btn btn-sm btn-primary" name="keep" value={claim.id} style={{ alignSelf: "flex-start" }}>Keep this one</button>
      )}
    </div>
  );
}

/** Two memories that disagree, side by side, with the buttons to settle it. */
export function ConflictCard({ c, projectId, canDecide, returnTo, label }: { c: ConflictView; projectId: string; canDecide: boolean; returnTo?: string; label?: React.ReactNode }) {
  return (
    <form action={resolveConflict} className="conflict">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="conflict_id" value={c.id} />
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
      <div className="conflict-why">
        <span className="k">{label}Why the AI checker stopped here ({when(c.createdAt)})</span>
        {c.reason ?? "These two memories seem to say different things."}
      </div>
      <div className="versus">
        <Side claim={c.claimA} label="A" canDecide={canDecide} />
        <div className="vs">vs</div>
        <Side claim={c.claimB} label="B" canDecide={canDecide} />
      </div>
      {canDecide ? (
        <div className="conflict-foot">
          <label className="sr-only" htmlFor={`note-${c.id}`}>Why (optional)</label>
          <input id={`note-${c.id}`} name="note" maxLength={500} placeholder="Why? (optional, saved with the decision)" />
          <button className="btn btn-sm" name="keep" value="both">Both are true</button>
        </div>
      ) : (
        <div className="conflict-foot faint small">Only an admin of this workspace can decide.</div>
      )}
    </form>
  );
}
