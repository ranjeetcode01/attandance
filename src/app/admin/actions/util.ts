import { redirect } from "next/navigation";

export const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
export const num = (form: FormData, key: string) => {
  const v = Number(form.get(key));
  return Number.isFinite(v) ? v : NaN;
};
export const bool = (form: FormData, key: string) => form.get(key) === "on" || form.get(key) === "true";
export const ids = (form: FormData, key: string) =>
  form
    .getAll(key)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

// Sends the admin back to a page with a one-line flash message.
export function back(path: string, msg: { ok?: string; err?: string }): never {
  const url = new URL(path, "http://x");
  url.searchParams.delete("ok");
  url.searchParams.delete("err");
  if (msg.ok) url.searchParams.set("ok", msg.ok);
  if (msg.err) url.searchParams.set("err", msg.err);
  redirect(url.pathname + url.search);
}

export function returnPath(form: FormData, fallback: string) {
  const p = str(form, "_back");
  return p.startsWith("/admin") ? p : fallback;
}
