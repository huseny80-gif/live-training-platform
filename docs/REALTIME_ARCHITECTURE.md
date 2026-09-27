# Realtime Architecture

## Overview

The platform supports two parallel mechanisms for delivering live session updates to the instructor dashboard:

1. **Socket.IO realtime events** (Phase 19) — instant push when a participant joins or answers
2. **HTTP polling fallback** — every 5 seconds via REST API, always active

Both run simultaneously. If the WebSocket connection is unavailable (e.g. Vercel deployment), polling carries the full load silently.

---

## Socket.IO Foundation (`src/lib/realtime/`)

Three files form the realtime layer:

| File | Purpose |
|------|---------|
| `types.ts` | Typed event payloads + `sessionRoom(code)` / `instructorRoom(id)` helpers |
| `socket-events.ts` | `REALTIME_EVENTS` constants under the `realtime:*` namespace |
| `socket-server.ts` | Typed server-side emit helpers (one per event) |

### Room naming

```
session:{code}      — all participants + instructor for a session
instructor:{id}     — instructor-only channel
```

### Events

| Constant | Wire name | Direction |
|----------|-----------|-----------|
| `PARTICIPANT_JOINED` | `realtime:participant_joined` | Server → room |
| `ANSWER_SUBMITTED` | `realtime:answer_submitted` | Server → room |
| `QUESTION_CHANGED` | `realtime:question_changed` | Server → room |
| `LEADERBOARD_UPDATED` | `realtime:leaderboard_updated` | Server → room |
| `SESSION_ENDED` | `realtime:session_ended` | Server → room |

---

## Client Integration — `SessionParticipantsList`

The component accepts an optional `sessionCode` prop. When provided:

1. A `socket.io-client` connection is opened to `/api/socket` (same origin — no hardcoded URL).
2. The client joins `session:{code}`.
3. On `PARTICIPANT_JOINED`, `fetchParticipants()` is called to re-sync from the API.
4. On unmount the listener is removed and the socket is disconnected.

When `sessionCode` is absent (or the WebSocket upgrade fails), only polling runs — no errors, no UI change.

---

## Polling Fallback

All instructor dashboard components retain their existing `setInterval` polling:

| Component | Interval |
|-----------|---------|
| `SessionParticipantsList` | 5 s |
| `SessionLiveStats` | varies |
| `SessionAnalyticsDashboard` | 8 s |
| `SessionLeaderboard` | 8 s |

Polling is never removed — it is the reliability floor on any deployment.

---

## Custom Server (`server.ts`)

The Socket.IO server is wired in `server.ts` at the project root. It creates an HTTP server, mounts Next.js as a request handler, and attaches `socket.io` at path `/api/socket`:

```ts
const io = new Server(httpServer, {
  cors: { origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000" },
  path: "/api/socket",
});
registerSessionHandlers(io);
```

Start in development:
```bash
npx tsx server.ts
```

> **NEXTAUTH_URL must be set in production** — the CORS `origin` falls back to `http://localhost:3000` if it is absent, which will cause WebSocket upgrades to be rejected on real domains.

---

## ⚠️ Vercel Limitation

**`server.ts` does not run on Vercel.**

Vercel deploys Next.js as serverless functions. Long-running Node.js processes (required for WebSocket servers) are not supported. The `/api/socket` path returns 404 and all `socket.io-client` connections fail silently.

**Impact:** The platform functions normally on Vercel via polling fallback. Realtime push is simply inactive — users see no errors.

---

## Production Options for Realtime

To enable WebSocket realtime in production, one of the following approaches is needed:

### Option A — Long-lived process platforms
Deploy `server.ts` as-is on a platform that keeps Node.js processes alive:

| Platform | Notes |
|----------|-------|
| **Railway** | `npm start` with `node dist/server.js`; free tier available |
| **Fly.io** | Dockerfile-based; supports persistent TCP; generous free allowance |
| **VPS / EC2** | Full control; use PM2 or systemd to manage the process |

### Option B — Managed WebSocket services (Vercel-compatible)
Replace the custom Socket.IO server with a hosted pub/sub provider:

| Service | Protocol | Notes |
|---------|---------|-------|
| **Pusher Channels** | WebSocket | Simple REST API to publish; drop-in client SDK |
| **Ably** | WebSocket / SSE | Generous free tier; supports presence channels |
| **Supabase Realtime** | WebSocket | Already available if using Supabase for the DB; table-change broadcasts |

### Option C — Server-Sent Events (SSE)
Native Next.js Route Handlers support streaming responses (`ReadableStream`). SSE is one-directional (server → client) but sufficient for all current realtime use cases (participant joined, answer submitted, leaderboard updated). No custom server required; fully Vercel-compatible.

---

## Current Status

| Environment | Realtime | Polling |
|-------------|---------|---------|
| Local (`npx tsx server.ts`) | ✅ Active | ✅ Active |
| Vercel | ❌ Inactive (silent) | ✅ Active |
| Railway / Fly.io / VPS | ✅ Active | ✅ Active |
