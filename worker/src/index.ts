import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import {
  activeCycle,
  addCalendarMonths,
  chooseDurationMonths,
  evaluate,
} from "./cycles";
import { getDb } from "./db";
import { panelPage } from "./panel";
import {
  cycles,
  enrollmentCodes,
  events,
  installations,
  tickets,
} from "./schema";
import {
  AuthError,
  bearer,
  enrollmentCode,
  jsonError,
  randomToken,
  requireAdmin,
  sha256,
} from "./security";
import { signState } from "./signing";
import {
  cyclePatchSchema,
  enrollmentSchema,
  eventSchema,
  stateSchema,
  ticketPatchSchema,
  ticketSchema,
} from "./validation";

const app = new Hono<{ Bindings: Env }>();
const DAY_MS = 24 * 60 * 60 * 1000;
const TICKET_TURNSTILE_ACTION = "ticket";

class RequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

app.onError((error, c) => {
  if (error instanceof AuthError || error instanceof RequestError) {
    return jsonError(error.code, error.status);
  }
  console.error(
    JSON.stringify({
      event: "request_error",
      path: new URL(c.req.url).pathname,
    }),
  );
  return jsonError("internal_error", 500);
});

app.get("/health", (c) => c.json({ ok: true, service: "aegisdesk-worker" }));
app.get("/", (c) => c.redirect("/tickets"));
app.get("/tickets", (c) => ticketsPage(c.env));

app.post("/api/v1/admin/enrollment-codes", async (c) => {
  const actor = await requireAdmin(c.req.raw, c.env);
  const id = crypto.randomUUID();
  const code = randomToken(12);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const db = getDb(c.env);
  await db
    .insert(enrollmentCodes)
    .values({
      id,
      codeHash: await sha256(code),
      createdAt,
      expiresAt,
      createdBy: actor,
    })
    .run();
  await insertEvent(c.env, {
    id: crypto.randomUUID(),
    serverReceivedAt: createdAt,
    type: "admin_enrollment_code_created",
    actor,
    payloadJson: JSON.stringify({
      enrollment_code_id: id,
      expires_at: expiresAt,
    }),
  });
  return c.json({ code, expires_at: expiresAt }, 201);
});

app.post("/api/v1/shell/enroll", async (c) => {
  const code = enrollmentCode(c.req.raw);
  if (!code) throw new RequestError("enrollment_required", 401);
  const body = await readJson(c, enrollmentSchema);
  const codeHash = await sha256(code);
  const now = new Date().toISOString();
  const installationId = crypto.randomUUID();
  const installationToken = randomToken(32);
  const durationMonths = chooseDurationMonths();
  const startedAt = now;
  const dueAt = addCalendarMonths(
    new Date(startedAt),
    durationMonths,
  ).toISOString();
  const cycleId = crypto.randomUUID();

  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE enrollment_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?",
    ).bind(now, codeHash, now),
    c.env.DB.prepare(
      "INSERT INTO installations (id, token_hash, equipment_name, sidc_target, created_at, shell_version, sidc_version, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')",
    ).bind(
      installationId,
      await sha256(installationToken),
      body.equipment_name,
      body.sidc_target,
      now,
      body.shell_version,
      body.sidc_version,
    ),
    c.env.DB.prepare(
      "INSERT INTO cycles (id, installation_id, started_at, duration_months, due_at, status, created_by, reason) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    ).bind(
      cycleId,
      installationId,
      startedAt,
      durationMonths,
      dueAt,
      "enrollment",
      "initial cycle",
    ),
    c.env.DB.prepare(
      "INSERT INTO events (id, installation_id, cycle_id, server_received_at, type, actor, shell_version, sidc_version, equipment_name, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      installationId,
      cycleId,
      now,
      "installation_enrolled",
      "enrollment",
      body.shell_version,
      body.sidc_version,
      body.equipment_name,
      JSON.stringify({}),
    ),
  ]);

  if (results[0]?.meta.changes !== 1) {
    throw new RequestError("enrollment_code_invalid_or_used", 409);
  }

  return c.json(
    {
      install_id: installationId,
      installation_token: installationToken,
      shell_config: {
        worker_base_url: new URL(c.req.url).origin,
        sidc_target: body.sidc_target,
        equipment_name: body.equipment_name,
        contact_name: c.env.CONTACT_NAME,
        ticket_url: c.env.TICKET_URL,
        protocol_version: 1,
      },
    },
    201,
  );
});

app.post("/api/v1/shell/state", async (c) => {
  const installation = await requireInstallation(c.env, c.req.raw);
  const body = await readJson(c, stateSchema);
  if (body.install_id !== installation.id)
    throw new RequestError("installation_mismatch", 403);
  const now = new Date();
  const serverTime = now.toISOString();
  const db = getDb(c.env);
  const cycle = await activeCycle(c.env, installation.id);
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
  const dayEnd = new Date(Date.parse(dayStart) + DAY_MS).toISOString();
  const todayRows = await db
    .select({ type: events.type })
    .from(events)
    .where(
      and(
        eq(events.installationId, installation.id),
        gte(events.serverReceivedAt, dayStart),
        lt(events.serverReceivedAt, dayEnd),
      ),
    )
    .all();
  const notice = evaluate(
    now,
    cycle,
    todayRows.map((row) => row.type),
    c.env.CONTACT_NAME,
  );
  const openEvent = {
    id: crypto.randomUUID(),
    installationId: installation.id,
    cycleId: cycle?.id,
    openId: body.open_id,
    serverReceivedAt: serverTime,
    type: "opening",
    shellVersion: body.shell_version,
    sidcVersion: body.sidc_version,
    equipmentName: installation.equipmentName,
    payloadJson: JSON.stringify({}),
  };
  await db.insert(events).values(openEvent).onConflictDoNothing().run();
  await db
    .update(installations)
    .set({
      lastOpenedAt: serverTime,
      shellVersion: body.shell_version,
      sidcVersion: body.sidc_version,
    })
    .where(eq(installations.id, installation.id))
    .run();

  if (notice) {
    const noticeType =
      notice.frequency === "once_in_final_14_days"
        ? "notice:final_14_days"
        : notice.frequency === "daily_in_final_7_days"
          ? "notice:final_7_days"
          : "notice:expired";
    await db
      .insert(events)
      .values({
        id: crypto.randomUUID(),
        installationId: installation.id,
        cycleId: cycle?.id,
        openId: body.open_id,
        serverReceivedAt: serverTime,
        type: noticeType,
        payloadJson: JSON.stringify({ notice_id: notice.id }),
      })
      .onConflictDoNothing()
      .run();
  }

  const cacheUntil = new Date(now.getTime() + DAY_MS).toISOString();
  const stateToken = await signState(c.env, {
    sub: installation.id,
    protocol_version: 1,
    server_time: serverTime,
    cache_until: cacheUntil,
    contact: { name: c.env.CONTACT_NAME, ticket_url: c.env.TICKET_URL },
    notices: notice ? [notice] : [],
  });
  return c.json({ state_token: stateToken });
});

app.post("/api/v1/shell/events", async (c) => {
  const installation = await requireInstallation(c.env, c.req.raw);
  const body = await readJson(c, eventSchema);
  const cycle = await activeCycle(c.env, installation.id);
  const receivedAt = new Date().toISOString();
  const db = getDb(c.env);
  await db
    .insert(events)
    .values({
      id: crypto.randomUUID(),
      installationId: installation.id,
      cycleId: cycle?.id,
      openId: body.open_id,
      serverReceivedAt: receivedAt,
      type: body.type,
      shellVersion: body.shell_version,
      sidcVersion: body.sidc_version,
      windowsUser: body.windows_user,
      equipmentName: body.equipment_name ?? installation.equipmentName,
      consentState: body.consent_state,
      launchResult: body.launch_result,
      payloadJson: JSON.stringify({}),
    })
    .onConflictDoNothing()
    .run();
  return c.json({ accepted: true }, 202);
});

app.get("/api/v1/admin/installations", async (c) => {
  await requireAdmin(c.req.raw, c.env);
  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(installations)
    .orderBy(desc(installations.createdAt))
    .all();
  const result = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      cycle: await activeCycle(c.env, row.id),
    })),
  );
  return c.json({ installations: result });
});

app.get("/api/v1/admin/events", async (c) => {
  await requireAdmin(c.req.raw, c.env);
  const rows = await getDb(c.env)
    .select()
    .from(events)
    .orderBy(desc(events.serverReceivedAt))
    .limit(500)
    .all();
  return c.json({ events: rows });
});

app.get("/api/v1/admin/audit", async (c) => {
  await requireAdmin(c.req.raw, c.env);
  const rows = await getDb(c.env)
    .select()
    .from(events)
    .orderBy(desc(events.serverReceivedAt))
    .limit(500)
    .all();
  return c.json({ events: rows });
});

app.get("/api/v1/admin/tickets", async (c) => {
  await requireAdmin(c.req.raw, c.env);
  const rows = await getDb(c.env)
    .select()
    .from(tickets)
    .orderBy(desc(tickets.createdAt))
    .limit(200)
    .all();
  return c.json({ tickets: rows });
});

app.post("/api/v1/admin/installations/:id/revoke", async (c) => {
  const actor = await requireAdmin(c.req.raw, c.env);
  const body = await readReason(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const now = new Date().toISOString();
  const updated = await db
    .update(installations)
    .set({ status: "revoked", revokedAt: now })
    .where(eq(installations.id, id))
    .run();
  if (updated.meta.changes !== 1)
    throw new RequestError("installation_not_found", 404);
  await insertEvent(c.env, {
    id: crypto.randomUUID(),
    installationId: id,
    serverReceivedAt: now,
    type: "admin_installation_revoked",
    actor,
    payloadJson: JSON.stringify({ reason: body.reason }),
  });
  return c.json({ revoked: true });
});

app.post("/api/v1/admin/cycles/:id/renew", async (c) => {
  const actor = await requireAdmin(c.req.raw, c.env);
  const body = await readReason(c);
  const cycleId = c.req.param("id");
  const db = getDb(c.env);
  const current = await db
    .select()
    .from(cycles)
    .where(eq(cycles.id, cycleId))
    .get();
  if (!current) throw new RequestError("cycle_not_found", 404);
  const now = new Date().toISOString();
  const durationMonths = chooseDurationMonths();
  const dueAt = addCalendarMonths(new Date(now), durationMonths).toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE cycles SET status = 'closed' WHERE id = ?").bind(
      cycleId,
    ),
    c.env.DB.prepare(
      "INSERT INTO cycles (id, installation_id, started_at, duration_months, due_at, status, created_by, reason) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    ).bind(
      crypto.randomUUID(),
      current.installationId,
      now,
      durationMonths,
      dueAt,
      actor,
      body.reason,
    ),
  ]);
  await insertEvent(c.env, {
    id: crypto.randomUUID(),
    installationId: current.installationId,
    cycleId,
    serverReceivedAt: now,
    type: "admin_cycle_renewed",
    actor,
    payloadJson: JSON.stringify({
      reason: body.reason,
      duration_months: durationMonths,
      due_at: dueAt,
    }),
  });
  return c.json({
    renewed: true,
    duration_months: durationMonths,
    due_at: dueAt,
  });
});

app.patch("/api/v1/admin/cycles/:id", async (c) => {
  const actor = await requireAdmin(c.req.raw, c.env);
  const body = await readJson(c, cyclePatchSchema);
  const cycleId = c.req.param("id");
  const current = await getDb(c.env)
    .select()
    .from(cycles)
    .where(eq(cycles.id, cycleId))
    .get();
  if (!current) throw new RequestError("cycle_not_found", 404);
  const dueAt =
    body.due_at ??
    (body.duration_months
      ? addCalendarMonths(
          new Date(current.startedAt),
          body.duration_months,
        ).toISOString()
      : current.dueAt);
  await getDb(c.env)
    .update(cycles)
    .set({
      dueAt,
      durationMonths: body.duration_months ?? current.durationMonths,
      reason: body.reason,
    })
    .where(eq(cycles.id, cycleId))
    .run();
  await insertEvent(c.env, {
    id: crypto.randomUUID(),
    installationId: current.installationId,
    cycleId,
    serverReceivedAt: new Date().toISOString(),
    type: "admin_cycle_adjusted",
    actor,
    payloadJson: JSON.stringify({
      reason: body.reason,
      previous_due_at: current.dueAt,
      due_at: dueAt,
    }),
  });
  return c.json({ updated: true, due_at: dueAt });
});

app.patch("/api/v1/admin/tickets/:id", async (c) => {
  const actor = await requireAdmin(c.req.raw, c.env);
  const body = await readJson(c, ticketPatchSchema);
  const ticketId = c.req.param("id");
  const db = getDb(c.env);
  const current = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .get();
  if (!current) throw new RequestError("ticket_not_found", 404);
  if (body.status)
    await db
      .update(tickets)
      .set({ status: body.status })
      .where(eq(tickets.id, ticketId))
      .run();
  await insertEvent(c.env, {
    id: crypto.randomUUID(),
    serverReceivedAt: new Date().toISOString(),
    type: "admin_ticket_updated",
    actor,
    payloadJson: JSON.stringify({
      ticket_id: ticketId,
      status: body.status,
      note: body.note ?? "",
    }),
  });
  return c.json({ updated: true });
});

app.get("/panel", async (c) => {
  await requireAdmin(c.req.raw, c.env);
  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(installations)
    .orderBy(desc(installations.createdAt))
    .all();
  const installationsView = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      equipmentName: row.equipmentName,
      shellVersion: row.shellVersion,
      sidcVersion: row.sidcVersion,
      lastOpenedAt: row.lastOpenedAt,
      status: row.status,
      cycle: await activeCycle(c.env, row.id),
    })),
  );
  const eventRows = await db
    .select()
    .from(events)
    .orderBy(desc(events.serverReceivedAt))
    .limit(200)
    .all();
  const ticketRows = await db
    .select()
    .from(tickets)
    .orderBy(desc(tickets.createdAt))
    .limit(200)
    .all();
  return c.html(
    panelPage(
      installationsView.map((item) => ({
        id: item.id,
        equipmentName: item.equipmentName,
        shellVersion: item.shellVersion,
        sidcVersion: item.sidcVersion,
        lastOpenedAt: item.lastOpenedAt,
        status: item.status,
        cycleId: item.cycle?.id ?? null,
        dueAt: item.cycle?.dueAt ?? null,
      })),
      ticketRows,
      eventRows,
    ),
  );
});

app.post("/api/v1/tickets", async (c) => {
  const body = await readTicketBody(c);
  if (c.env.TICKET_RATE_LIMIT) {
    const key = c.req.header("cf-connecting-ip") ?? "unknown";
    const result = await c.env.TICKET_RATE_LIMIT.limit({
      key: `ticket:${key}`,
    });
    if (!result.success) throw new RequestError("rate_limited", 429);
  }
  if (
    !(await verifyTurnstile(
      c.env,
      body.turnstile_token,
      c.req.header("cf-connecting-ip"),
      new URL(c.req.url).hostname,
    ))
  ) {
    throw new RequestError("turnstile_required", 400);
  }
  const db = getDb(c.env);
  const existing = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, body.idempotency_key))
    .get();
  if (existing)
    return c.json({ ticket_id: existing.id, notified: existing.notified }, 202);
  const createdAt = new Date().toISOString();
  await db
    .insert(tickets)
    .values({
      id: body.idempotency_key,
      createdAt,
      name: body.name,
      team: body.team,
      description: body.description,
      status: "open",
      notified: false,
    })
    .run();
  const notified = await sendTicketEmail(c.env, {
    id: body.idempotency_key,
    ...body,
  });
  if (notified)
    await db
      .update(tickets)
      .set({ notified: true, notifiedAt: new Date().toISOString() })
      .where(eq(tickets.id, body.idempotency_key))
      .run();
  return c.json({ ticket_id: body.idempotency_key, notified }, 202);
});

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    const cutoff = new Date(Date.now() - 365 * DAY_MS).toISOString();
    await env.DB.prepare("DELETE FROM events WHERE server_received_at < ?")
      .bind(cutoff)
      .run();
  },
};

export { app };

async function readJson<T>(
  c: { req: { json: <U>() => Promise<U> } },
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
): Promise<T> {
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    throw new RequestError("invalid_json", 400);
  }
  const result = schema.safeParse(input);
  if (!result.success || result.data === undefined)
    throw new RequestError("invalid_payload", 400);
  return result.data;
}

async function readTicketBody(c: Context<{ Bindings: Env }>) {
  const contentType = c.req.header("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await c.req.parseBody();
    const result = ticketSchema.safeParse(form);
    if (!result.success) throw new RequestError("invalid_payload", 400);
    return result.data;
  }
  return readJson(c, ticketSchema);
}

async function readReason(c: {
  req: { json: <U>() => Promise<U> };
}): Promise<{ reason: string }> {
  const body = await readJson(c, {
    safeParse(value: unknown) {
      const reason =
        typeof value === "object" && value !== null && "reason" in value
          ? (value as { reason?: unknown }).reason
          : undefined;
      return typeof reason === "string" &&
        reason.trim().length > 0 &&
        reason.length <= 512
        ? { success: true, data: { reason: reason.trim() } }
        : { success: false };
    },
  });
  return body;
}

async function requireInstallation(env: Env, request: Request) {
  const token = bearer(request);
  if (!token) throw new RequestError("installation_auth_required", 401);
  const tokenHash = await sha256(token);
  const row = await getDb(env)
    .select()
    .from(installations)
    .where(eq(installations.tokenHash, tokenHash))
    .get();
  if (row?.status !== "active")
    throw new RequestError("installation_revoked_or_unknown", 403);
  return row;
}

async function insertEvent(env: Env, values: typeof events.$inferInsert) {
  await getDb(env).insert(events).values(values).onConflictDoNothing().run();
}

async function verifyTurnstile(
  env: Env,
  token: string,
  remoteip?: string,
  expectedHostname?: string,
): Promise<boolean> {
  if (String(env.ENVIRONMENT) !== "production" && !env.TURNSTILE_SECRET)
    return true;
  if (!env.TURNSTILE_SECRET) return false;
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: token,
  });
  if (remoteip) body.set("remoteip", remoteip);
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  if (!response.ok) return false;
  const result = (await response.json()) as {
    success?: boolean;
    action?: string;
    hostname?: string;
  };
  return (
    result.success === true &&
    result.action === TICKET_TURNSTILE_ACTION &&
    result.hostname === expectedHostname
  );
}

async function sendTicketEmail(
  env: Env,
  ticket: { id: string; name: string; team: string; description: string },
): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM || !env.NOTIFY_DESTINATION)
    return false;
  const text = [
    `Ticket: ${ticket.id}`,
    `Nombre: ${ticket.name}`,
    `Equipo: ${ticket.team}`,
    "",
    ticket.description,
  ].join("\n");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `aegisdesk-ticket-${ticket.id}`,
      },
      body: JSON.stringify({
        from: env.NOTIFY_FROM,
        to: [env.NOTIFY_DESTINATION],
        subject: `AegisDesk ticket ${ticket.id}`,
        text,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function ticketsPage(env: Env): Response {
  const siteKey = escapeHtml(env.PUBLIC_TURNSTILE_SITE_KEY || "");
  const turnstileScript =
    siteKey && siteKey !== "replace-before-deploy"
      ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'
      : "";
  const widget =
    siteKey && siteKey !== "replace-before-deploy"
      ? `<div class="cf-turnstile" data-sitekey="${siteKey}" data-action="${TICKET_TURNSTILE_ACTION}"></div>`
      : "";
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Soporte AegisDesk</title><style>body{font-family:system-ui,sans-serif;background:#f4f7fb;color:#162033;margin:0;padding:32px}main{max-width:720px;margin:auto;background:#fff;padding:28px;border:1px solid #dce3ed;border-radius:16px}label{display:block;margin-top:16px;font-weight:600}input,textarea{box-sizing:border-box;width:100%;margin-top:6px;padding:10px;border:1px solid #9aa9bd;border-radius:8px;font:inherit}textarea{min-height:150px}button{margin-top:20px;padding:10px 16px;border:0;border-radius:8px;background:#2457d6;color:#fff;font-weight:600;cursor:pointer}.muted{color:#667085}#result{margin-top:16px;color:#2457d6}</style>${turnstileScript}</head><body><main><h1>Soporte SIDC</h1><p class="muted">Describe el problema y el equipo donde ocurre. No envíes contraseñas ni datos de pacientes.</p><form id="ticket-form"><label>Nombre<input name="name" maxlength="128" required></label><label>Equipo<input name="team" maxlength="128" required></label><label>Descripción<textarea name="description" maxlength="4000" required></textarea></label>${widget}<button type="submit">Enviar ticket</button></form><p id="result" role="status"></p></main><script>document.querySelector('#ticket-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const turnstile = document.querySelector('[name="cf-turnstile-response"]')?.value || 'local-development'; const response = await fetch('/api/v1/tickets', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({name:form.get('name'), team:form.get('team'), description:form.get('description'), turnstile_token:turnstile, idempotency_key:crypto.randomUUID()})}); const body = await response.json(); document.querySelector('#result').textContent = response.ok ? 'Ticket registrado: ' + body.ticket_id : 'No se pudo registrar el ticket.'; if (response.ok) event.currentTarget.reset(); });</script></body></html>`,
    { headers: { "content-type": "text/html; charset=UTF-8" } },
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
