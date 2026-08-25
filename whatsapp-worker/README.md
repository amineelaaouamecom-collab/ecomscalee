# Ecom OS WhatsApp worker

Clean worker source for one isolated `whatsapp-web.js` session per workspace.

```bash
cp .env.example .env
npm install
npm test
npm start
```

For local development inside the Ecom OS repository, `npm run dev` also reads
`../.env`, accepts `VITE_SUPABASE_URL`, and uses the legacy `dev-secret` only on
`127.0.0.1` when `WORKER_API_SECRET` is absent. Production still requires an
explicit `WORKER_API_SECRET` and should use a standalone worker `.env`.

Node 20+ and a Chromium-compatible runtime are required. Use a persistent encrypted session volume. Never package `.env`, `sessions/`, `.wwebjs_auth/`, `.wwebjs_cache/`, or `node_modules/` into deployment artifacts.

The worker:

- restores enabled non-disconnected sessions;
- atomically claims one job per workspace to enforce sending intervals;
- checks workspace enablement, connection state, opt-out, expiry, and Moroccan mobile validity immediately before send;
- renders text and voice-message sequences from private Supabase Storage;
- records provider IDs and acknowledgements;
- applies exponential backoff for known transient failures;
- fails closed on uncertain provider delivery to prevent duplicate sends;
- processes inbound replies through the service-only `process_whatsapp_inbound` RPC;
- emits workspace heartbeats for health monitoring.

The HTTP control surface is designed for the `whatsapp-control` Edge Function, not browsers. Only `/health` is public.
