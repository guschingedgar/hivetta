"use server";

import type { AutoSave } from "@memory/store";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MEMBER_ROLES, type MemberRole } from "@memory/schema";
import { AUTO_SAVE, StoreError } from "@memory/store";
import { env } from "@/lib/env";
import { requireSession, safeNext, storeFor } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Thin wrappers: authorisation is enforced by RLS inside the store's queries,
// never by checks here. Each action re-derives the session from cookies.

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function back(path: string, error: unknown): never {
  const message =
    error instanceof StoreError
      ? error.code === "forbidden" || error.code === "not_found"
        ? "You don't have permission to do that."
        : error.code === "conflict"
          ? "That name is already taken."
          : error.message
      : error instanceof Error
        ? error.message
        : String(error);
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

// ---- auth -----------------------------------------------------------------

export async function signIn(form: FormData) {
  const next = safeNext(str(form, "next"), "/projects");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: str(form, "email"), password: str(form, "password") });
  if (error) back(`/login?next=${encodeURIComponent(next)}`, error.message);
  redirect(next);
}

/** Sends a reset link. Always answers the same way, so the form never reveals who has an account. */
export async function requestPasswordReset(form: FormData) {
  const email = str(form, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("/forgot", "Enter a valid email address.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${env.appUrl}/auth/callback?next=/reset` });
  if (error && /rate|too many|seconds/i.test(error.message)) back("/forgot", "Too many requests. Wait a minute and try again.");
  redirect(`/forgot?sent=1&email=${encodeURIComponent(email)}`);
}

/** Sets a new password for the person signed in through a reset link. */
export async function setNewPassword(form: FormData) {
  await requireSession("/forgot");
  const password = String(form.get("password") ?? "");
  const confirmation = String(form.get("confirm_password") ?? "");
  if (password.length < 8) back("/reset", "Your password needs at least 8 characters.");
  if (password !== confirmation) back("/reset", "The two passwords don’t match.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) back("/reset", /same|different/i.test(error.message) ? "Choose a password different from your old one." : error.message);
  redirect(`/projects?notice=${encodeURIComponent("Your password is changed.")}`);
}

export async function signUp(form: FormData) {
  // New accounts start with the short tutorial, unless they came from an assistant's sign-in.
  const asked = safeNext(str(form, "next"), "/projects");
  const next = asked.startsWith("/oauth/") ? asked : "/welcome";
  const returnTo = `/login?mode=signup&next=${encodeURIComponent(next)}`;
  const password = String(form.get("password") ?? "");
  const confirmation = String(form.get("confirm_password") ?? "");
  if (password.length < 8) back(returnTo, "Your password needs at least 8 characters.");
  if (password !== confirmation) back(returnTo, "The two passwords don’t match.");
  const name = str(form, "name").replace(/\s+/g, " ").slice(0, 40);
  if (!name) back(returnTo, "Tell us what to call you.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: str(form, "email"),
    password,
    options: { emailRedirectTo: `${env.appUrl}/auth/callback?next=${encodeURIComponent(next)}`, data: { display_name: name } },
  });
  if (error) back(returnTo, error.message);
  if (!data.session) {
    redirect(`/login?next=${encodeURIComponent(next)}&notice=${encodeURIComponent("Check your email to confirm your account, then sign in.")}`);
  }
  redirect(next);
}

/** Saves the name people see on everything you save, and in the greeting. */
export async function setName(form: FormData) {
  const next = safeNext(str(form, "next"), "/projects");
  const session = await requireSession(`/hello?next=${encodeURIComponent(next)}`);
  try {
    await storeFor(session).setMyName(str(form, "name"));
  } catch (e) {
    back(`/hello?next=${encodeURIComponent(next)}`, e);
  }
  revalidatePath("/", "layout");
  redirect(next);
}

/** Turns auto-save off, to drafts, or straight to memory for the signed-in person. */
export async function setAutoSave(form: FormData) {
  const back_to = safeNext(str(form, "return_to"), "/connect");
  const session = await requireSession(back_to);
  const mode = str(form, "mode") as AutoSave;
  if (!AUTO_SAVE.includes(mode)) back(back_to, "Pick one of the three options.");
  try {
    await storeFor(session).setAutoSave(mode);
  } catch (e) {
    back(back_to, e);
  }
  revalidatePath("/", "layout");
  const msg = mode === "off" ? "Auto-save is off." : mode === "drafts" ? "Auto-save is on: your AI saves to your drafts. Start a new conversation for it to apply." : "Auto-save is on: your AI saves straight to memory. Start a new conversation for it to apply.";
  redirect(`${back_to}${back_to.includes("?") ? "&" : "?"}notice=${encodeURIComponent(msg)}`);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---- workspaces, projects, members ---------------------------------------

/** Cookie remembering which workspace the sidebar shows. Not a permission: RLS decides access. */
const WS_COOKIE = "cm_ws";

export async function switchWorkspace(form: FormData) {
  await requireSession("/projects");
  (await cookies()).set(WS_COOKIE, str(form, "workspace_id"), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
  redirect("/projects");
}

export async function createWorkspace(form: FormData) {
  const store = storeFor(await requireSession("/projects"));
  try {
    const id = await store.createWorkspace(str(form, "name"));
    (await cookies()).set(WS_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  } catch (err) {
    back(safeNext(str(form, "error_to"), "/projects"), err);
  }
  revalidatePath("/", "layout");
  const returnTo = str(form, "return_to");
  redirect(returnTo ? safeNext(returnTo, "/projects") : `/projects?notice=${encodeURIComponent("Workspace created. Now add your first project.")}`);
}

export async function createProject(form: FormData) {
  const store = storeFor(await requireSession("/projects"));
  let id: string;
  try {
    id = await store.createProject(str(form, "workspace_id"), str(form, "name"));
  } catch (err) {
    back(safeNext(str(form, "error_to"), "/projects"), err);
  }
  revalidatePath("/", "layout");
  const returnTo = str(form, "return_to");
  redirect(returnTo ? safeNext(returnTo, "/projects") : `/projects/${id}`);
}

export async function inviteMember(form: FormData) {
  const projectId = str(form, "project_id");
  const path = safeNext(str(form, "return_to"), `/projects/${projectId}/team`);
  const store = storeFor(await requireSession(path));
  const role = str(form, "role") as MemberRole;
  if (!MEMBER_ROLES.includes(role)) back(path, "Pick a role.");
  let outcome: string;
  try {
    outcome = await store.inviteMember(str(form, "workspace_id"), str(form, "email"), role);
  } catch (err) {
    back(path, err);
  }
  revalidatePath(path);
  redirect(`${path}${path.includes("?") ? "&" : "?"}notice=${encodeURIComponent(outcome === "added" ? "Member added." : outcome === "member" ? "They’re already a member: nothing changed." : "Invitation recorded: they join when they sign up with that email.")}`);
}

export async function removeMember(form: FormData) {
  const projectId = str(form, "project_id");
  const path = `/projects/${projectId}/team`;
  const store = storeFor(await requireSession(path));
  try {
    await store.removeMember(str(form, "workspace_id"), str(form, "user_id"));
  } catch (err) {
    back(path, err);
  }
  revalidatePath("/", "layout");
  redirect(`${path}?notice=${encodeURIComponent("Access removed. What they saved stays in memory, with their name.")}`);
}

export async function cancelInvitation(form: FormData) {
  const projectId = str(form, "project_id");
  const path = `/projects/${projectId}/team`;
  const store = storeFor(await requireSession(path));
  try {
    await store.cancelInvitation(str(form, "workspace_id"), str(form, "email"));
  } catch (err) {
    back(path, err);
  }
  revalidatePath(path);
  redirect(`${path}?notice=${encodeURIComponent("Invitation cancelled.")}`);
}

// ---- review ---------------------------------------------------------------

export async function reviewClaim(form: FormData) {
  const projectId = str(form, "project_id");
  const returnTo = safeNext(str(form, "return_to"), `/projects/${projectId}`);
  const store = storeFor(await requireSession(returnTo));
  const decision = str(form, "decision");
  if (decision !== "accepted" && decision !== "rejected") back(returnTo, "Unknown review decision.");
  try {
    await store.setClaimStatus(str(form, "claim_id"), decision);
  } catch (err) {
    back(returnTo, err);
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  redirect(returnTo);
}

// ---- conflicts ------------------------------------------------------------

/** keep = a claim id (that one wins) or "both" (not a real conflict). */
export async function resolveConflict(form: FormData) {
  const projectId = str(form, "project_id");
  const path = safeNext(str(form, "return_to"), `/projects/${projectId}/conflicts`);
  const store = storeFor(await requireSession(path));
  const keep = str(form, "keep");
  if (!keep) back(path, "Pick which claim to keep.");
  try {
    await store.resolveConflict(str(form, "conflict_id"), keep === "both" ? null : keep, str(form, "note") || undefined);
  } catch (err) {
    back(path, err);
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/inbox");
  redirect(`${path}${path.includes("?") ? "&" : "?"}notice=${encodeURIComponent(keep === "both" ? "Both claims stay in memory." : "Done. Hivetta now has one answer.")}`);
}

// ---- branches -------------------------------------------------------------

export async function mergeBranch(form: FormData) {
  const projectId = str(form, "project_id");
  const path = `/projects/${projectId}/branches`;
  const store = storeFor(await requireSession(path));
  let sent = 0;
  try {
    ({ claimsSent: sent } = await store.mergeBranch(projectId, str(form, "name")));
  } catch (err) {
    back(path, err);
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  redirect(`${path}?notice=${encodeURIComponent(`Merged. ${sent} draft${sent === 1 ? " is" : "s are"} being checked by the AI checker now.`)}`);
}

export async function abandonBranch(form: FormData) {
  const projectId = str(form, "project_id");
  const path = `/projects/${projectId}/branches`;
  const store = storeFor(await requireSession(path));
  try {
    await store.abandonBranch(projectId, str(form, "name"));
  } catch (err) {
    back(path, err);
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  redirect(`${path}?notice=${encodeURIComponent("Closed without merging. The drafts are kept for reference.")}`);
}

// ---- OAuth consent (Supabase OAuth 2.1 server authorization path) ---------

export async function decideConsent(form: FormData) {
  const authorizationId = str(form, "authorization_id");
  await requireSession(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`);
  const supabase = await createSupabaseServerClient();
  const approve = str(form, "decision") === "approve";
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) back(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`, error?.message ?? "Authorization failed.");
  redirect(data.redirect_url);
}
