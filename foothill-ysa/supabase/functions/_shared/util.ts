// Shared helpers for the Foothill YSA edge functions.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name) ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing secret ${name} (see SETUP.md)`);
  return v;
}
export const optionalEnv = (name: string) => Deno.env.get(name) || undefined;

export const WARD_NAME = () => optionalEnv("WARD_NAME") ?? "Foothill YSA";
export const SITE_URL = () => env("SITE_URL").replace(/\/+$/, "");
export const manageLink = (token: string) => `${SITE_URL()}/u.html?t=${token}`;

/** Service-role client: bypasses row level security. Only use inside functions. */
export function adminDb(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Returns the signed-in user's id if their JWT belongs to an owner/admin, else null. */
export async function requireAdmin(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const db = adminDb();
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) return null;
  const { data: p } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return p && (p.role === "owner" || p.role === "admin") ? data.user.id : null;
}

// ---------------------------------------------------------------- HTTP
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
export const preflight = (req: Request) => (req.method === "OPTIONS" ? new Response("ok", { headers: cors }) : null);

// ---------------------------------------------------------------- phones & text
/** "(801) 555-1234", "801.555.1234", "+18015551234" -> "+18015551234"; null if not a US number. */
export function normalizePhone(input: string): string | null {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10 || !/^[2-9]/.test(d)) return null;
  return "+1" + d;
}

/** Phones love curly quotes, which turn a 160-character text into a 70-character one. */
export function plainText(s: string): string {
  return String(s ?? "")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...").replace(/ ?[·•] ?/g, " - ")
    .replace(/ /g, " ")
    .replace(/\r\n/g, "\n")
    .trim();
}

export const cleanName = (s: unknown) => plainText(String(s ?? "")).replace(/\s+/g, " ").slice(0, 80) || null;

// ---------------------------------------------------------------- Twilio
const dryRun = () => optionalEnv("DRY_RUN") === "true";

export async function sendSms(to: string, body: string): Promise<{ sid?: string; error?: string; code?: number }> {
  if (dryRun()) {
    console.log(`[DRY_RUN] to ${to}: ${body}`);
    return { sid: "dry-run" };
  }
  const sid = env("TWILIO_ACCOUNT_SID");
  const form = new URLSearchParams({ To: to, Body: body, MessagingServiceSid: env("TWILIO_MESSAGING_SERVICE_SID") });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${env("TWILIO_AUTH_TOKEN")}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.message ?? `Twilio error ${res.status}`, code: data.code };
  return { sid: data.sid };
}

/** Checks X-Twilio-Signature so nobody but Twilio can post fake incoming texts. */
export async function validTwilioSignature(url: string, params: Record<string, string>, signature: string | null) {
  if (dryRun() && !optionalEnv("TWILIO_AUTH_TOKEN")) return true;
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env("TWILIO_AUTH_TOKEN")), { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

const xmlEscape = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** TwiML reply to an incoming text (or no reply). */
export function twiml(reply?: string) {
  const inner = reply ? `<Message>${xmlEscape(reply)}</Message>` : "";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

// ---------------------------------------------------------------- email (optional)
/** Emails NOTIFY_EMAIL through Resend when RESEND_API_KEY is set; otherwise does nothing. */
export async function notifyEmail(subject: string, text: string) {
  const key = optionalEnv("RESEND_API_KEY"), to = optionalEnv("NOTIFY_EMAIL");
  if (!key || !to) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: optionalEnv("NOTIFY_FROM") ?? "Foothill YSA <onboarding@resend.dev>",
      to: to.split(",").map((s) => s.trim()),
      subject,
      text,
    }),
  });
  if (!res.ok) console.error("Resend failed", res.status, await res.text());
}
