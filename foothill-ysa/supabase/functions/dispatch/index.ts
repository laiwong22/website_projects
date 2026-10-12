// Sends announcement texts.
//  - The admin site calls it with { message_id } right after "Send now".
//  - A cron job calls it every minute (header x-cron-secret) to send scheduled messages.
// Each message goes to every active subscriber with an active membership in any of its groups,
// once per person even if they're in several of those groups.
import { adminDb, env, json, manageLink, plainText, preflight, requireAdmin, sendSms } from "../_shared/util.ts";

const CONCURRENCY = 8;
const TIME_BUDGET_MS = 110_000; // leave headroom under the edge-function time limit; the next run resumes

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const isCron = req.headers.get("x-cron-secret") === env("CRON_SECRET");
  if (!isCron && !(await requireAdmin(req))) return json({ error: "Not allowed" }, 401);

  const started = Date.now();
  const db = adminDb();
  const body = await req.json().catch(() => ({}));
  const { data: claimed, error } = await db.rpc("claim_due_messages", { only_id: body.message_id ?? null });
  if (error) return json({ error: error.message }, 500);

  const results = [];
  for (const msg of claimed ?? []) {
    try {
      results.push(await sendMessage(msg, started));
    } catch (e) {
      console.error(e);
      await db.from("messages").update({ status: "failed", error: String(e) }).eq("id", msg.id);
      results.push({ id: msg.id, error: String(e) });
    }
  }
  return json({ processed: results });

  async function sendMessage(msg: { id: string; body: string; group_ids: string[]; include_unsub_link: boolean }, t0: number) {
    // Everyone who should get it.
    const { data: members, error: mErr } = await db.from("memberships")
      .select("subscriber_id, subscribers!inner(id, phone, token, status)")
      .in("group_id", msg.group_ids).eq("status", "active").eq("subscribers.status", "active");
    if (mErr) throw mErr;
    const people = new Map<string, { id: string; phone: string; token: string }>();
    for (const m of members ?? []) {
      // deno-lint-ignore no-explicit-any
      const s = (m as any).subscribers;
      people.set(s.id, s);
    }
    // Skip anyone this message already reached (a resumed run).
    const { data: done } = await db.from("deliveries").select("subscriber_id").eq("message_id", msg.id);
    for (const d of done ?? []) people.delete(d.subscriber_id);

    const queue = [...people.values()];
    const text = plainText(msg.body);
    let outOfTime = false;
    const worker = async () => {
      while (queue.length) {
        if (Date.now() - t0 > TIME_BUDGET_MS) { outOfTime = true; return; }
        const s = queue.shift()!;
        const out = msg.include_unsub_link ? `${text}\n\nUnsubscribe: ${manageLink(s.token)}` : text;
        const r = await sendSms(s.phone, out);
        await db.from("deliveries").upsert({
          message_id: msg.id, subscriber_id: s.id, twilio_sid: r.sid ?? null,
          status: r.error ? "failed" : "queued", error: r.error ?? null,
        });
        // 21610 = they texted STOP at some point; keep our list in sync with Twilio's.
        if (r.code === 21610) {
          await db.from("subscribers").update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() }).eq("id", s.id);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (outOfTime) return { id: msg.id, resumed_later: true };

    const { data: stats } = await db.from("message_stats").select("sent, failed").eq("message_id", msg.id).maybeSingle();
    await db.from("messages").update({
      status: "sent", sent_at: new Date().toISOString(), recipient_count: stats?.sent ?? 0,
      error: stats?.failed ? `${stats.failed} text(s) failed` : null,
    }).eq("id", msg.id);
    return { id: msg.id, sent: stats?.sent ?? 0, failed: stats?.failed ?? 0 };
  }
});
