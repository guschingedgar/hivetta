import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { Tour } from "./tour";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const signedIn = Boolean(await getSession().catch(() => null));
  return <Tour signedIn={signedIn} />;
}
