"use client";

import { useState } from "react";

/** The name input, with a live preview of a memory signed with it. */
export function NameField({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const shown = name.trim() || "You";
  return (
    <>
      <label className="field">Your name
        <input name="name" required maxLength={40} autoFocus autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Edgar" />
      </label>
      <div className="hello-preview" aria-hidden>
        <span className="bar" />
        <div>
          <p>Payments go through Stripe Checkout.</p>
          <small><span className="face">{shown[0]!.toUpperCase()}</span><b>{shown}</b> in Claude · just now</small>
        </div>
      </div>
    </>
  );
}
