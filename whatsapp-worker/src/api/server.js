import express from "express";
import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { supabase } from "../supabase/client.js";
import { disconnectClient, getClient, getClientState, getOrCreateClient, waitForConnectionState } from "../whatsapp/client-manager.js";
import { normalizeMoroccanPhone } from "../utils/phone.js";

function authorized(value) {
  const expected = Buffer.from(`Bearer ${config.apiSecret}`);
  const actual = Buffer.from(value || "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function workspaceId(value) {
  const result = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new Error("Invalid workspace_id");
  return result;
}

export function createApiServer() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/health", (_req, res) => res.json({ ok: true, version: config.version }));
  app.use((req, res, next) => authorized(req.headers.authorization) ? next() : res.status(401).json({ error: "Unauthorized" }));

  app.post("/connect", async (req, res) => {
    try {
      const id = workspaceId(req.body.workspace_id);
      const { data: settings } = await supabase.from("whatsapp_settings").select("enabled").eq("workspace_id", id).maybeSingle();
      if (!settings?.enabled) return res.status(409).json({ error: "Enable WhatsApp automation before connecting" });
      await getOrCreateClient(id);
      res.status(202).json(await waitForConnectionState(id));
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  app.post("/disconnect", async (req, res) => {
    try {
      const id = workspaceId(req.body.workspace_id);
      await disconnectClient(id, req.body.revoke_session !== false);
      res.json({ status: "disconnected" });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  app.get("/status/:workspaceId", (req, res) => {
    try { res.json(getClientState(workspaceId(req.params.workspaceId))); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });

  app.post("/test", async (req, res) => {
    try {
      const id = workspaceId(req.body.workspace_id);
      const phone = normalizeMoroccanPhone(req.body.phone);
      if (!phone) return res.status(400).json({ error: "Invalid Moroccan mobile number" });
      const client = getClient(id);
      if (!client || getClientState(id).status !== "ready") return res.status(409).json({ error: "WhatsApp is not ready" });
      const numberId = await client.getNumberId(phone);
      if (!numberId?._serialized) return res.status(422).json({ error: "Number is not registered on WhatsApp" });
      const body = String(req.body.message || "Ecom OS WhatsApp test ✅").slice(0, 4000);
      const sent = await client.sendMessage(numberId._serialized, body);
      const providerId = sent?.id?._serialized || null;
      await supabase.from("whatsapp_messages").insert({ workspace_id: id, phone, normalized_phone: phone, remote_jid: numberId._serialized, direction: "outbound", message_type: "test", body, wa_message_id: providerId, provider_event_id: providerId, status: "sent" });
      res.json({ ok: true, message_id: providerId });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  return app;
}
