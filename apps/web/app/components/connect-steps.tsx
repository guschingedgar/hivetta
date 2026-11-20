import Link from "next/link";
import { CopyButton } from "@/app/components/client";

export const AIS = [
  { key: "claude", label: "Claude" },
  { key: "chatgpt", label: "ChatGPT" },
  { key: "other", label: "Another AI" },
] as const;
export type AiKey = (typeof AIS)[number]["key"];

const K = ({ children }: { children: React.ReactNode }) => <span className="kbd">{children}</span>;

const GUIDES: Record<AiKey, { video?: { src: string; poster: string; label: string }; time: string; steps: React.ReactNode[] }> = {
  claude: {
    video: { src: "/media/claude-setup.mp4", poster: "/media/claude-setup-poster.jpg", label: "Video: adding Hivetta to Claude, step by step" },
    time: "About 1 minute",
    steps: [
      <>In Claude, open <K>Customize</K> in the sidebar.</>,
      <>Go to the <K>Connectors</K> tab.</>,
      <>Click <K>Add</K>, then <K>Add custom connector</K>.</>,
      <>Name it <b>Hivetta</b>, paste the address, click <K>Continue</K>.</>,
      <>Sign in to Hivetta and click <b>Allow</b>.</>,
    ],
  },
  chatgpt: {
    video: { src: "/media/chatgpt-setup.mp4", poster: "/media/chatgpt-setup-poster.jpg", label: "Video: adding Hivetta to ChatGPT, step by step" },
    time: "About 1 minute",
    steps: [
      <>In ChatGPT, open <K>Plugins</K> in the sidebar.</>,
      <>Click <K>Add</K> at the top right, then <K>Add custom MCP server</K>.</>,
      <>Name it <b>Hivetta</b> and paste the address. Leave Authentication on <b>OAuth</b>. For the icon, <a href="/hivetta-icon.png" download className="cg-dl">download ours</a> and add it.</>,
      <>Tick <b>I understand and want to continue</b>, then click <K>Create as a plugin</K>.</>,
      <>Click <K>Connect Hivetta</K>, sign in to Hivetta and click <b>Allow</b>.</>,
    ],
  },
  other: {
    time: "About 2 minutes",
    steps: [
      <>Find where your assistant adds <b>connectors</b>, <b>MCP servers</b> or <b>custom tools</b>, usually in its settings.</>,
      <>Add a new one named <b>Hivetta</b> and paste the address. Choose <b>OAuth</b> if it asks how to sign in.</>,
      <>Sign in to Hivetta when asked and click <b>Allow</b>.</>,
    ],
  },
};

/** Address, AI picker, video and steps: the same guide on Setup and Connect. */
export function ConnectGuide({ url, ai, hrefFor }: { url: string; ai: AiKey; hrefFor: (k: AiKey) => string }) {
  const g = GUIDES[ai];
  return (
    <div className="cg">
      <div className="cg-top">
        <nav className="cg-tabs" aria-label="Which assistant">
          {AIS.map((a) => (
            <Link key={a.key} href={hrefFor(a.key)} scroll={false} aria-current={a.key === ai ? "page" : undefined}>
              <span className="cg-logo" data-ai={a.key} aria-hidden>
                {a.key === "other" ? "+" : <img src={`https://www.google.com/s2/favicons?domain=${a.key === "claude" ? "claude.ai" : "chatgpt.com"}&sz=64`} alt="" width={22} height={22} />}
              </span>{a.label}
            </Link>
          ))}
        </nav>
        <span className="faint xs">{g.time}, once per person</span>
      </div>

      <div className="cg-addr">
        <span className="cg-addr-l">Your Hivetta address</span>
        <code>{url}</code>
        <CopyButton value={url} />
      </div>

      <div className={`cg-body${g.video ? "" : " no-video"}`}>
        {g.video && (
          <div className="cg-screen">
            <div className="cg-chrome" aria-hidden><i /><i /><i /><span>{ai === "claude" ? "claude.ai" : "chatgpt.com"}</span></div>
            <video key={g.video.src} src={g.video.src} poster={g.video.poster} controls muted playsInline loop autoPlay preload="metadata" aria-label={g.video.label} />
          </div>
        )}
        <ol className="cg-steps">
          {g.steps.map((s, i) => (
            <li key={i}><span className="n">{i + 1}</span><span>{s}</span></li>
          ))}
        </ol>
      </div>
    </div>
  );
}
