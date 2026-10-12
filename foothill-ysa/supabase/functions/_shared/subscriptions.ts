// Subscribing, confirming and unsubscribing, shared by the web form and text keywords.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { manageLink, WARD_NAME } from "./util.ts";

export type Subscriber = { id: string; phone: string; name: string | null; status: string; token: string; last_confirm_sent_at: string | null };
export type Group = { id: string; slug: string; name: string; keyword: string | null; groupme_url: string | null; is_default: boolean; is_active: boolean };

export async function findSubscriber(db: SupabaseClient, phone: string): Promise<Subscriber | null> {
  const { data, error } = await db.from("subscribers").select("*").eq("phone", phone).maybeSingle();
  if (error) throw error;
  return data;
}

export async function activeGroups(db: SupabaseClient): Promise<Group[]> {
  const { data, error } = await db.from("groups").select("*").eq("is_active", true).order("sort");
  if (error) throw error;
  return data ?? [];
}

/**
 * Adds the subscriber to groups. Groups an admin removed them from are skipped
 * (an admin can put them back). Returns the groups actually joined.
 */
export async function joinGroups(db: SupabaseClient, subscriberId: string, groups: Group[]): Promise<Group[]> {
  if (!groups.length) return [];
  const { data: existing } = await db.from("memberships").select("group_id, status").eq("subscriber_id", subscriberId);
  const removed = new Set((existing ?? []).filter((m) => m.status === "removed").map((m) => m.group_id));
  const ok = groups.filter((g) => !removed.has(g.id));
  if (ok.length) {
    const now = new Date().toISOString();
    const { error } = await db.from("memberships").upsert(
      ok.map((g) => ({ subscriber_id: subscriberId, group_id: g.id, status: "active", updated_at: now })),
    );
    if (error) throw error;
  }
  return ok;
}

export async function leaveGroups(db: SupabaseClient, subscriberId: string, groupIds: string[]) {
  if (!groupIds.length) return;
  const { error } = await db.from("memberships")
    .update({ status: "left", updated_at: new Date().toISOString() })
    .eq("subscriber_id", subscriberId).eq("status", "active").in("group_id", groupIds);
  if (error) throw error;
}

export async function setStatus(db: SupabaseClient, id: string, status: "active" | "unsubscribed") {
  const now = new Date().toISOString();
  const patch = status === "active"
    ? { status, confirmed_at: now, unsubscribed_at: null }
    : { status, unsubscribed_at: now };
  const { error } = await db.from("subscribers").update(patch).eq("id", id);
  if (error) throw error;
}

export function welcomeText(s: Subscriber, joined: Group[]) {
  const names = joined.map((g) => g.name).join(", ");
  const chats = joined.filter((g) => g.groupme_url).map((g) => `${g.name} chat: ${g.groupme_url}`);
  return [
    `Welcome to ${WARD_NAME()} texts${names ? ` (${names})` : ""}! Msg frequency varies, about 2-3/wk. Msg&data rates may apply.`,
    ...chats,
    `Manage or unsubscribe: ${manageLink(s.token)} or reply STOP.`,
  ].join("\n");
}

export const confirmText = () =>
  `${WARD_NAME()}: reply JOIN to confirm you want our texts (about 2-3/wk). Msg&data rates may apply. Reply STOP to opt out.`;
