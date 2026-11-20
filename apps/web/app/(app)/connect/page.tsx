import type { Metadata } from "next";
import { AutoSaveCard } from "@/app/components/auto-save";
import { CopyButton } from "@/app/components/client";
import { AIS, ConnectGuide, type AiKey } from "@/app/components/connect-steps";
import { Flash } from "@/app/components/flash";
import { Icon } from "@/app/components/ui";
import { myAutoSave } from "@/lib/data";
import { mcpUrl } from "@/lib/env";

export const metadata: Metadata = { title: "Connect your AI" };

const PROMPTS = [
  "Brief me on this project from Hivetta.",
  "Save what we decided to Hivetta.",
  "Search Hivetta: how do we handle payments?",
  "Write a handover for Louis on where we are.",
];

export default async function ConnectPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { error, notice, ai: aiParam } = await searchParams;
  const ai: AiKey = AIS.find((a) => a.key === aiParam)?.key ?? "claude";
  const auto = await myAutoSave();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="crumb">Your AIs</p>
          <h1>Connect <em className="serif-em">your AI</em></h1>
          <p className="muted">Each teammate adds Hivetta to their own assistant, once. After that it’s there in every chat.</p>
        </div>
      </div>

      <Flash error={error} notice={notice} />

      <div className="stack-lg">
        <section className="card card-pad">
          <ConnectGuide url={mcpUrl()} ai={ai} hrefFor={(k) => `/connect?ai=${k}`} />
        </section>

        <div className="cg-pair">
          <AutoSaveCard mode={auto} returnTo={`/connect?ai=${ai}`} />

          <section className="card card-pad stack" aria-labelledby="try-title">
            <div>
              <p id="try-title" style={{ fontWeight: 600 }}>Then just talk</p>
              <p className="muted small">No commands to learn. Mention Hivetta and your assistant does the rest.</p>
            </div>
            <div className="cg-prompts">
              {PROMPTS.map((p) => (
                <div key={p} className="prompt-row"><span className="prompt">{p}</span><CopyButton value={p} quiet /></div>
              ))}
            </div>
          </section>
        </div>

        <section className="tip">
          <span style={{ color: "var(--accent)", marginTop: 2 }}><Icon name="alert" size={18} /></span>
          <div>
            <p style={{ fontWeight: 600 }}>A new feature doesn’t show up in your assistant?</p>
            <p className="muted small" style={{ marginTop: 4 }}>
              Assistants remember the list of tools from when you connected. Disconnect Hivetta in your assistant’s settings and connect it again.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
