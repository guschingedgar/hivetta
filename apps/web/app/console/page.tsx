import { redirect } from "next/navigation";

// Old address of the app home, kept so earlier links still work.
export default function Console() {
  redirect("/projects");
}
