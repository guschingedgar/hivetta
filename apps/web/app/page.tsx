import { Mark } from "@/app/components/logo";
import Link from "next/link";
import "./landing/landing.css";
import { Ambient, HeroCopy, HeroScene, Nav } from "./landing/hero";
import { Icon, Note, Rise, Words } from "./landing/parts";
import { ClashArt, CountsArt, DraftsArt, HandoverArt, HistoryArt, HowItWorks, Islands, SearchArt, TeamArt } from "./landing/sections";
import { getSession } from "@/lib/session";

function Tile({ className, title, text, tags, children, dark, wide }: { className: string; title: string; text: string; tags?: string[]; children: React.ReactNode; dark?: boolean; wide?: boolean }) {
  return (
    <Rise className={`lp-tile ${className}${dark ? " dark" : ""}${wide ? " wide" : ""}`}>
      <div>
        <h3>{title}</h3>
        <p className="d">{text}</p>
        {tags && <div className="tags">{tags.map((t) => <span key={t}>{t}</span>)}</div>}
      </div>
      <div className="art">{children}</div>
    </Rise>
  );
}

export default async function Landing() {
  const signedIn = Boolean(await getSession().catch(() => null));
  const start = signedIn ? "/projects" : "/login?mode=signup";

  return (
    <div className="lp">
      <Ambient />
      <Nav signedIn={signedIn} />

      <main>
        <section className="lp-hero">
          <div className="lp-grid-bg" aria-hidden />
          <div className="lp-wrap lp-hero-inner">
            <HeroCopy signedIn={signedIn} />
            <HeroScene />
          </div>
          <div className="lp-wrap lp-works" aria-label="Works with">
            <span className="lbl">Works with</span>
            <b>Claude</b><b>ChatGPT</b><b>Any assistant with connectors</b>
          </div>
        </section>

        <section id="solution" className="lp-section" aria-labelledby="problem-title">
          <div className="lp-wrap">
            <div className="lp-head center">
              <p className="lp-eyebrow" style={{ "--c": "var(--question)" } as React.CSSProperties}><span className="no">01</span>The problem</p>
              <h2 id="problem-title"><Words text="Every AI chat is" soft="an island." /></h2>
              <p>Your team makes decisions in dozens of separate conversations. None of them talk to each other, so everyone gets a different answer.</p>
            </div>
            <Rise><Islands /></Rise>
            <div className="lp-points">
              {[
                { t: "Context stays in one chat", d: "What you worked out with your assistant is invisible the moment a teammate opens theirs.", c: "var(--fact)", i: <path d="M4 5h16v11H9l-5 4V5Z" /> },
                { t: "Handovers lose the why", d: "You pass on the files. The reasons behind them stay in your chat history.", c: "var(--assumption)", i: <><path d="M5 3h10l4 4v14H5z" /><path d="M9 12h6M9 16h4" /></> },
                { t: "Two AIs, two answers", d: "One assistant says Stripe, another suggests PayPal. Nobody notices until it’s built.", c: "var(--person)", i: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></> },
              ].map((p, i) => (
                <Rise key={p.t} delay={i * 0.08} className="lp-point">
                  <span className="ico" style={{ background: `color-mix(in srgb, ${p.c} 14%, white)`, color: p.c }}><Icon d={p.i} size={20} /></span>
                  <h3>{p.t}</h3>
                  <p>{p.d}</p>
                </Rise>
              ))}
            </div>
          </div>
        </section>

        <section id="how" aria-labelledby="how-title">
          <div className="lp-wrap" style={{ paddingTop: 40 }}>
            <div className="lp-head center">
              <p className="lp-eyebrow" style={{ "--c": "var(--decision)" } as React.CSSProperties}><span className="no">02</span>How it works</p>
              <h2 id="how-title"><Words text="Keep the AI you already use." soft="Add one shared memory." /></h2>
              <p>No new app to learn. You talk to your assistant like you always do.</p>
            </div>
          </div>
          <HowItWorks />
        </section>

        <section id="features" className="lp-section" aria-labelledby="features-title">
          <div className="lp-wrap">
            <div className="lp-head center">
              <p className="lp-eyebrow" style={{ "--c": "var(--assumption)" } as React.CSSProperties}><span className="no">03</span>Features</p>
              <h2 id="features-title"><Words text="Everything your team decided," soft="in one place you can trust." /></h2>
              <p>Real pieces of Hivetta, with an example project.</p>
            </div>
            <div className="lp-bento">
              <Tile className="t-indigo s4" dark wide title="Ask in plain words" text="Search finds memories by meaning, not just exact words. Every answer shows who saved it and with which AI." tags={["Meaning search", "Who and when"]}>
                <SearchArt />
              </Tile>
              <Tile className="t-white s2" title="Every kind of memory" text="Each memory is tagged, so you can scan a project at a glance.">
                <CountsArt />
              </Tile>
              <Tile className="t-sand s3" title="Catches contradictions" text="An AI checker compares every new memory with what the team knows. When two disagree, a person picks the right one." tags={["New: added", "Repeat: skipped", "Clash: you decide"]}>
                <ClashArt />
              </Tile>
              <Tile className="t-lavender s3" title="Handovers that keep the why" text="Finished your part? Your assistant writes the handover: where things stand, next steps, links. The next person’s AI reads it first.">
                <HandoverArt />
              </Tile>
              <Tile className="t-rose s2" title="Drafts for ideas in progress" text="Explore in a separate space. Merge it when it’s decided.">
                <DraftsArt />
              </Tile>
              <Tile className="t-mint s2" title="Nothing is ever lost" text="Old decisions are replaced, never deleted, with the reason.">
                <HistoryArt />
              </Tile>
              <Tile className="t-sky s2" title="Your whole team, any AI" text="Everyone keeps their favourite assistant.">
                <TeamArt />
              </Tile>
            </div>
          </div>
        </section>

        <section className="lp-section" style={{ paddingTop: 40 }} aria-label="Summary">
          <div className="lp-wrap">
            <p className="lp-statement">
              <Words text="Whoever asks, in whatever AI, gets the same answer." soft="With who decided it, when, and why." />
            </p>
          </div>
        </section>

        <section className="lp-wrap" style={{ paddingBottom: 80 }} aria-labelledby="cta-title">
          <Rise className="lp-cta">
            <h2 id="cta-title">Give your team one memory.</h2>
            <p>Create a project, invite your teammates, connect your AI. Free during the beta.</p>
            <div className="lp-cta-row"><Link href={start} className="lp-btn lp-btn-light">Start free<span className="arrow" aria-hidden>→</span></Link><Note className="cta-note" arrow="left" color="#fff" delay={0.8}>no card needed</Note></div>
          </Rise>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <span className="lp-brand"><Mark size={24} />Hivetta</span>
          <span><a href="/data" style={{ marginRight: 18 }}>What we store</a>Beta, 2026</span>
        </div>
      </footer>
    </div>
  );
}
