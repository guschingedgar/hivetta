import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/app/components/client";
import { Icon } from "@/app/components/ui";
import { Note, Rise, Words } from "@/app/landing/parts";
import { myProjects } from "@/lib/data";

export const metadata: Metadata = { title: "Discover" };

type IconName = Parameters<typeof Icon>[0]["name"];
type Feature = { icon: IconName; title: string; text: string; say?: string; open?: { label: string; href: (p: string) => string } };
type Group = { key: string; title: string; em: string; color: string; intro: string; items: Feature[] };

const GROUPS: Group[] = [
  {
    key: "save", title: "Save", em: "what matters", color: "var(--mint)",
    intro: "Your AI does the writing. You just ask.",
    items: [
      { icon: "memory", title: "Save from any conversation", text: "Your AI picks out the decisions, facts, assumptions and open questions, one clear sentence each.", say: "Save what we decided to Hivetta." },
      { icon: "spark", title: "Keep the why", text: "Each memory can carry the reasoning, the details and the links behind it. Click any card to read them.", say: "Save this decision, with the reasons and the options we rejected." },
      { icon: "chat", title: "Log open questions", text: "Things nobody has answered yet are saved too, so they don’t get lost.", say: "Add who signs off the pricing page as an open question." },
    ],
  },
  {
    key: "find", title: "Find", em: "it again", color: "var(--sky)",
    intro: "Ask in your own words, from any AI or from here.",
    items: [
      { icon: "search", title: "Search by meaning", text: "No need for the exact words: ask a question, get the memories that answer it.", say: "Search Hivetta: how do we take payments?", open: { label: "Search memory", href: (p) => `${p}/memory` } },
      { icon: "rocket", title: "Get briefed", text: "Starting a conversation? Your AI reads the project’s decisions and open questions first.", say: "Brief me on the shop relaunch." },
      { icon: "clock", title: "See the history", text: "Replaced and set-aside memories stay visible, so you can see how a decision changed.", open: { label: "Open history", href: (p) => `${p}/memory?view=history` } },
    ],
  },
  {
    key: "trust", title: "Trust", em: "what you read", color: "var(--sun)",
    intro: "Several people and AIs write here. These keep it reliable.",
    items: [
      { icon: "check", title: "AI checker", text: "Every new memory is compared with what the team already knows. Repeats are set aside automatically." },
      { icon: "alert", title: "Settle contradictions", text: "When two memories disagree, nothing is overwritten: a person picks which one is right.", open: { label: "Needs you", href: () => "/inbox" } },
      { icon: "eye", title: "Who, which AI, when", text: "Every memory shows who saved it, from which AI, and when. Nobody can rewrite it afterwards." },
    ],
  },
  {
    key: "work", title: "Work", em: "together", color: "var(--lilac)",
    intro: "Pass work on, explore safely, bring your team.",
    items: [
      { icon: "note", title: "Handovers", text: "Done with your part? Leave a note with where things stand, next steps and links.", say: "Write a handover for Louis on where we are.", open: { label: "Handovers", href: (p) => `${p}/handoffs` } },
      { icon: "branch", title: "Drafts", text: "Exploring an idea? Save it as drafts. Merge when it’s decided, or drop it.", say: "Save this as drafts in a branch called pricing-ideas.", open: { label: "Drafts", href: (p) => `${p}/branches` } },
      { icon: "people", title: "Invite your team", text: "Everyone keeps their own AI. Roles decide who can read, save, or settle conflicts.", open: { label: "People", href: (p) => `${p}/team` } },
      { icon: "plug", title: "Connect another AI", text: "Claude and ChatGPT today, and any assistant that supports connectors.", open: { label: "Connect", href: () => "/setup?step=connect" } },
    ],
  },
];

export default async function DiscoverPage() {
  const projects = await myProjects();
  const base = projects[0] ? `/projects/${projects[0].id}` : "/projects";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="crumb">Discover</p>
          <h1><Words text="Everything it" soft="can do." /></h1>
        </div>
      </div>

      <nav className="dv-jump" aria-label="Sections">
        {GROUPS.map((g) => (
          <a key={g.key} href={`#${g.key}`} style={{ "--k": g.color } as React.CSSProperties}><i />{g.title}</a>
        ))}
        <Note className="dv-note" arrow="left" color="var(--accent)" delay={0.5}>copy a phrase, paste it in your AI</Note>
      </nav>

      {GROUPS.map((g, gi) => (
        <section key={g.key} id={g.key} className="dv-sec" aria-labelledby={`h-${g.key}`}>
          <div className="dv-head" style={{ "--k": g.color } as React.CSSProperties}>
            <span className="dv-n">{String(gi + 1).padStart(2, "0")}</span>
            <div>
              <h2 id={`h-${g.key}`}>{g.title} <em className="serif-em">{g.em}</em></h2>
              <p className="muted">{g.intro}</p>
            </div>
          </div>
          <div className="dv-grid">
            {g.items.map((f, i) => (
              <Rise key={f.title} delay={0.04 * i} y={14}>
                <article className="dv-card" style={{ "--k": g.color } as React.CSSProperties}>
                  <span className="ic"><Icon name={f.icon} size={17} /></span>
                  <h3>{f.title}</h3>
                  <p className="tx">{f.text}</p>
                  {(f.say || f.open) && (
                    <div className="dv-foot">
                      {f.say && (
                        <div className="dv-say">
                          <span className="say">“{f.say}”</span>
                          <CopyButton value={f.say} quiet />
                        </div>
                      )}
                      {f.open && <Link href={f.open.href(base)} className="dv-open">{f.open.label}<Icon name="arrow" size={13} /></Link>}
                    </div>
                  )}
                </article>
              </Rise>
            ))}
          </div>
        </section>
      ))}

      <p className="dv-more small muted">Wondering where your data goes? <Link href="/data" style={{ color: "var(--accent)", fontWeight: 600 }}>See what we store</Link>.</p>
    </div>
  );
}
