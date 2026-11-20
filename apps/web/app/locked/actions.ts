"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, accessToken } from "@/lib/access";

export async function unlock(form: FormData) {
  const code = process.env.HIVETTA_ACCESS_CODE?.trim();
  const given = String(form.get("code") ?? "");
  const raw = String(form.get("next") ?? "/");
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  if (!code) redirect(next);
  const token = await accessToken(given);
  if (token !== (await accessToken(code))) redirect(`/locked?error=1&next=${encodeURIComponent(next)}`);
  (await cookies()).set(ACCESS_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180 });
  redirect(next);
}
