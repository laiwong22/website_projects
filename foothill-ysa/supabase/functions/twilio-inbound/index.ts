// Twilio calls this for every text someone sends to the ward number.
//   JOIN [your name] / YES    subscribe (or confirm a web sign-up) to the main ward list
//   <group keyword>           join that group, e.g. RUN, READ, SCRIPTURE
//   LEAVE <group keyword>     leave one group
//   NAME <your name>          set the name we have for them
//   STOP / START              Twilio itself handles these and replies; we just record them
//   anything else             goes to the admin Inbox (and an email, if set up)
import { adminDb, env, normalizePhone, notifyEmail, optionalEnv, twiml, validTwilioSignature, WARD_NAME, cleanName } from "../_shared/util.ts";
import { activeGroups, findSubscriber, joinGroups, leaveGroups, setStatus, welcomeText, type Group, type Subscriber } from "../_shared/subscriptions.ts";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const START_WORDS = new Set(["START", "UNSTOP"]);
const JOIN_WORDS = new Set(["JOIN", "YES", "SUBSCRIBE"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const params = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
  const url = optionalEnv("TWILIO_WEBHOOK_URL") ?? `${env("SUPABASE_URL")}/functions/v1/twilio-inbound`;
  if (!(await validTwilioSignature(url, params, req.headers.get("X-Twilio-Signature")))) {
    return new Response("Bad signature", { status: 403 });
  }

  try {
    const phone = normalizePhone(params.From ?? "");
    const text = String(params.Body ?? "").trim();
    if (!phone) return twiml(); // not a US number we can handle
    const db = adminDb();
    const [first = "", ...rest] = text.split(/\s+/);
    const word = first.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const restText = rest.join(" ");
    let sub = await findSubscriber(db, phone);
    const groups = await activeGroups(db);

    const ensureSub = async (name: string | null): Promise<Subscriber> => {
      if (sub) return sub;
      const { data, error } = await db.from("subscribers").insert({ phone, name, source: "text", status: "active", confirmed_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      return (sub = data);
    };
    const activate = async (s: Subscriber) => {
      if (s.status !== "active") await setStatus(db, s.id, "active");
    };
    const withNamePrompt = (s: Subscriber, msg: string) =>
      s.name ? msg : `${msg}\nReply NAME and your name (e.g. NAME Sam Lee) so we know who you are.`;

    if (STOP_WORDS.has(word) && !restText) {
      if (sub) await setStatus(db, sub.id, "unsubscribed");
      return twiml(); // Twilio sends the "you've been unsubscribed" reply
    }

    if (START_WORDS.has(word) && !restText) {
      const s = await ensureSub(null);
      await activate(s);
      if (!(await hasActiveGroup(s.id))) await joinGroups(db, s.id, groups.filter((g) => g.is_default));
      return twiml(); // Twilio sends its own reply
    }

    if (JOIN_WORDS.has(word)) {
      const s = await ensureSub(cleanName(restText));
      if (restText && !s.name) await db.from("subscribers").update({ name: cleanName(restText) }).eq("id", s.id);
      await activate(s);
      let joined: Group[] = [];
      if (!(await hasActiveGroup(s.id))) joined = await joinGroups(db, s.id, groups.filter((g) => g.is_default));
      else joined = await currentGroups(s.id, groups);
      return twiml(withNamePrompt({ ...s, name: s.name ?? cleanName(restText) }, welcomeText(s, joined)));
    }

    if (word === "NAME" && restText) {
      if (!sub) return twiml(`Text JOIN to get ${WARD_NAME()} texts first.`);
      await db.from("subscribers").update({ name: cleanName(restText) }).eq("id", sub.id);
      return twiml(`Thanks, ${cleanName(restText)}!`);
    }

    if (word === "LEAVE") {
      const kw = restText.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const g = groups.find((g) => g.keyword === kw);
      if (!sub || !g) return twiml(`To leave a group, text LEAVE and its keyword (e.g. LEAVE RUN). To stop all texts, reply STOP.`);
      await leaveGroups(db, sub.id, [g.id]);
      return twiml(`You left ${g.name}. Text ${g.keyword} to rejoin anytime.`);
    }

    const group = !restText ? groups.find((g) => g.keyword === word) : undefined;
    if (group) {
      const s = await ensureSub(null);
      await activate(s);
      const joined = await joinGroups(db, s.id, [group]);
      if (!joined.length) return twiml(`Sorry, you can't rejoin ${group.name} by text. Reply to this message if you think that's a mistake.`);
      const chat = group.groupme_url ? `\nJoin the chat: ${group.groupme_url}` : "";
      return twiml(withNamePrompt(s, `You joined ${group.name}!${chat}\nText LEAVE ${group.keyword} to leave, STOP to stop all texts.`));
    }

    // A real reply: put it in the Inbox.
    await db.from("inbox_messages").insert({ phone, subscriber_id: sub?.id ?? null, direction: "in", body: text || "(empty message)" });
    await notifyEmail(
      `New text from ${sub?.name ?? phone}`,
      `${sub?.name ?? "Unknown"} (${phone}) texted ${WARD_NAME()}:\n\n${text}\n\nReply from the Inbox: ${optionalEnv("SITE_URL") ?? ""}/admin/#inbox`,
    ).catch((e) => console.error(e));
    return twiml();
  } catch (e) {
    console.error(e);
    return twiml();
  }

  async function hasActiveGroup(subscriberId: string) {
    const { count } = await adminDb().from("memberships").select("*", { count: "exact", head: true })
      .eq("subscriber_id", subscriberId).eq("status", "active");
    return (count ?? 0) > 0;
  }
  async function currentGroups(subscriberId: string, groups: Group[]) {
    const { data } = await adminDb().from("memberships").select("group_id").eq("subscriber_id", subscriberId).eq("status", "active");
    const ids = new Set((data ?? []).map((m) => m.group_id));
    return groups.filter((g) => ids.has(g.id));
  }
});
