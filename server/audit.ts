import type { Queryable } from "./db.js";
import type { Ctx } from "./http.js";

export interface AuditInput {
  action: string; // e.g. "payment.update", "user.invite", "auth.login"
  entity?: string;
  entityId?: string | number;
  summary: string; // human readable Thai sentence
  before?: unknown;
  after?: unknown;
  status?: "ok" | "failed" | "denied";
  // for events that happen before a session exists (login attempts)
  actor?: { id?: number | null; email?: string; name?: string; role?: string };
}

const MAX_JSON = 20_000;
const clip = (v: unknown) => {
  if (v === undefined) return null;
  const s = JSON.stringify(v);
  return s.length > MAX_JSON ? JSON.stringify({ truncated: true, preview: s.slice(0, 2000) }) : s;
};

/** Never throws: auditing must not break the action itself. */
export async function audit(c: Ctx, input: AuditInput, q: Queryable = c.db): Promise<number | null> {
  try {
    const u = c.user;
    const a = input.actor;
    const rows = await q.query<{ id: number }>(
      `insert into audit_log
         (user_id, user_email, user_name, role, action, entity, entity_id, summary,
          before, after, ip, user_agent, method, path, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15) returning id`,
      [
        a?.id ?? u?.id ?? null,
        a?.email ?? u?.email ?? "",
        a?.name ?? (u ? `${u.firstName} ${u.lastName}`.trim() : ""),
        a?.role ?? u?.role ?? "",
        input.action,
        input.entity ?? "",
        input.entityId == null ? "" : String(input.entityId),
        input.summary,
        clip(input.before),
        clip(input.after),
        c.ip,
        c.ua.slice(0, 300),
        c.req.method,
        c.url.pathname,
        input.status ?? "ok",
      ],
    );
    return rows[0]?.id ?? null;
  } catch (e) {
    console.error("[audit]", e);
    return null;
  }
}
