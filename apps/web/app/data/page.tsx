import type { Metadata } from "next";
import Link from "next/link";
import { Brand, Icon } from "@/app/components/ui";

export const metadata: Metadata = {
  title: "What we store",
  description: "What Hivetta keeps, what it never sees, where it lives and who can read it.",
};

type IconName = Parameters<typeof Icon>[0]["name"];

const KEEP: { icon: IconName; title: string; text: string }[] = [
  { icon: "people", title: "Your account", text: "Your email, your name, and your password (stored hashed by our sign-in provider, never readable by us)." },
  { icon: "memory", title: "The memories your AI saves", text: "Each one: the sentence, its kind, and the why, details and links your AI attached to it." },
  { icon: "eye", title: "Who saved what", text: "For every memory: who saved it, from which AI and model, and when. This is what lets the team trust it." },
  { icon: "note", title: "Handovers and drafts", text: "The notes you leave for teammates, and draft memories you haven’t merged yet." },
  { icon: "check", title: "The checker’s verdicts", text: "When the AI checker compares a new memory with the others, its verdict and one-line reason are kept." },
  { icon: "key", title: "Your team", text: "Your workspaces, projects, who is a member, their role, and pending invitations." },
];

const NEVER = [
  "Your conversations. Your AI sends only the memories you ask it to save, never the chat itself.",
  "Anything from your AI account: other chats, files, settings or history.",
  "Payment details. The beta is free and asks for none.",
  "Tracking or advertising. There are no ad trackers on this site.",
];

const SERVICES = [
  { name: "Supabase", what: "Database and sign-in", where: "Paris, France (EU)" },
  { name: "Vercel", what: "Runs this website and the connector your AI talks to", where: "Global network" },
  { name: "OpenAI", what: "Turns each memory into numbers so search understands meaning (only the memory text is sent)", where: "United States" },
  { name: "Anthropic", what: "Runs the AI checker: compares a new memory with similar ones (only those texts are sent)", where: "United States" },
];

export default function DataPage() {
  return (
    <div className="dt">
      <header className="dt-top">
        <Brand />
        <Link href="/login" className="btn btn-sm">Sign in</Link>
      </header>

      <section className="dt-hero">
        <p className="crumb">Your data</p>
        <h1>What we <em className="serif-em">store</em>, and what we don’t.</h1>
        <p className="dt-lead">Hivetta only keeps what your AI explicitly saves for your team. Here is all of it, in plain words.</p>
      </section>

      <section className="dt-sec">
        <h2>What we keep</h2>
        <div className="dt-grid">
          {KEEP.map((k) => (
            <article key={k.title} className="dt-card">
              <span className="sq sm sq-mint"><Icon name={k.icon} size={14} /></span>
              <h3>{k.title}</h3>
              <p>{k.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="dt-sec dt-two">
        <div className="dt-box dt-never">
          <h2>What we never see</h2>
          <ul>{NEVER.map((n) => <li key={n}><Icon name="x" size={14} /><span>{n}</span></li>)}</ul>
        </div>
        <div className="dt-box">
          <h2>Who can read it</h2>
          <ul>
            <li><Icon name="check" size={14} /><span>Only the people in your workspace. Projects are sealed off from each other, and the database itself enforces it.</span></li>
            <li><Icon name="check" size={14} /><span>Your AI, only after you sign in and allow it. An AI can read and propose memories, never approve, invite or settle anything.</span></li>
            <li><Icon name="check" size={14} /><span>We don’t sell or share your data, and we don’t train any AI model on it.</span></li>
          </ul>
        </div>
      </section>

      <section className="dt-sec">
        <h2>Nothing is silently deleted</h2>
        <p className="dt-p">
          A shared memory is only trustworthy if nobody can quietly rewrite it. So a saved memory is never edited or erased: when it’s wrong, it’s replaced by a newer
          one, and the old version stays in the history with who replaced it and why. Keep this in mind before saving anything sensitive.
        </p>
        <p className="dt-p">
          Want your account or a workspace removed, or have a question about your data? Write to <a href="mailto:contact@hivetta.com" className="dt-mail">contact@hivetta.com</a> and we’ll handle it by hand during the beta.
        </p>
      </section>

      <section className="dt-sec">
        <h2>Services we use</h2>
        <div className="dt-table">
          {SERVICES.map((s) => (
            <div key={s.name} className="dt-row">
              <b>{s.name}</b>
              <span>{s.what}</span>
              <span className="faint">{s.where}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dt-sec dt-tip">
        <Icon name="alert" size={18} />
        <p><b>Good habit:</b> never ask your AI to save passwords, API keys or private personal details. The AI is told not to, but you decide what it saves.</p>
      </section>

      <footer className="dt-foot">
        <Brand />
        <span className="faint small">Beta, 2026 · Last updated November 2026 · <a href="mailto:contact@hivetta.com">contact@hivetta.com</a></span>
      </footer>
    </div>
  );
}
