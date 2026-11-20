import type { AutoSave } from "@memory/store";
import { setAutoSave } from "@/app/actions";
import { Icon } from "@/app/components/ui";

const OPTIONS: { mode: AutoSave; title: string; text: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { mode: "off", title: "Off", text: "Your AI saves only when you ask it to.", icon: "x" },
  { mode: "drafts", title: "Auto-save to drafts", text: "Your AI saves what gets decided on its own, into your drafts. You review and merge.", icon: "branch" },
  { mode: "memory", title: "Auto-save to memory", text: "Your AI saves what gets decided straight into the team memory, through the AI checker.", icon: "spark" },
];

/** The three-way auto-save switch for the signed-in person. */
export function AutoSaveCard({ mode, returnTo }: { mode: AutoSave; returnTo: string }) {
  return (
    <section className="card card-pad stack auto-card" id="auto-save" style={{ scrollMarginTop: 24 }} aria-labelledby="auto-title">
      <div>
        <p id="auto-title" style={{ fontWeight: 600 }}>Auto-save</p>
        <p className="muted small">Let your AI save decisions as you talk, without you asking. Applies to new conversations, in every AI you connected.</p>
      </div>
      <div className="auto-opts" role="radiogroup" aria-labelledby="auto-title">
        {OPTIONS.map((o) => (
          <form key={o.mode} action={setAutoSave}>
            <input type="hidden" name="mode" value={o.mode} />
            <input type="hidden" name="return_to" value={returnTo} />
            <button className="auto-opt" role="radio" aria-checked={mode === o.mode} data-on={mode === o.mode || undefined}>
              <span className="ic"><Icon name={o.icon} size={14} /></span>
              <span className="tx"><b>{o.title}</b><span>{o.text}</span></span>
              <span className="tick" aria-hidden>{mode === o.mode && <Icon name="check" size={13} />}</span>
            </button>
          </form>
        ))}
      </div>
      {mode !== "off" && <p className="faint xs">Memories saved this way are labelled “Saved automatically”. To pause in one conversation, tell your AI “stop auto-saving”.</p>}
    </section>
  );
}
