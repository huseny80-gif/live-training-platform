# Realtime Event Systems — Architecture Note

There are two parallel Socket.IO event systems in this codebase. They serve
different purposes and must NOT be merged without careful coordination.

---

## System 1 — `EVENTS` (src/lib/session/events.ts)

**Owner:** `src/lib/session/socket/handler.ts`  
**Direction:** Bidirectional (Client ↔ Server via WebSocket)  
**Consumers:** Instructor client (WebSocket control path)  
**String prefix:** none — e.g. `"session:started"`, `"instructor:start_session"`

### Purpose
The instructor's browser opens a persistent WebSocket connection and sends
imperative control commands (start session, show question, etc.) and receives
acknowledgements and state snapshots through this channel. These are
request/response style interactions tightly coupled to `handler.ts`.

### Events owned by EVENTS
- `instructor:*` — commands sent FROM instructor TO server
- `participant:join` / `participant:submit_answer` — participant WebSocket actions
- `session:*` / `question:*` / `answer:*` / `server:*` / `error` — server responses

---

## System 2 — `REALTIME_EVENTS` (src/lib/realtime/socket-events.ts)

**Owner:** `src/lib/realtime/socket-server.ts`  
**Direction:** Server → Client (broadcast only)  
**Consumers:** React components (SessionLiveStats, SessionLeaderboard, participant page)  
**String prefix:** `"realtime:"` — e.g. `"realtime:session_started"`

### Purpose
Typed broadcast helpers used by the service layer (Server Actions path via
`io-singleton`) and by `handler.ts` to push state-change notifications to all
room members. React components listen with `useEffect` + `socket.on(REALTIME_EVENTS.X)`.
The polling fallback (`fetchState`) handles the case where Socket.IO is unavailable.

### Events owned by REALTIME_EVENTS
- `realtime:participant_joined` — new participant joined
- `realtime:answer_submitted` — participant answered
- `realtime:leaderboard_updated` — leaderboard recalculated
- `realtime:session_started/paused/resumed/ended` — session lifecycle
- `realtime:question_started/changed/locked` — question lifecycle

---

## Room naming

| Room | Members | Emitter |
|------|---------|---------|
| `session:<sessionCode>` | All participants + instructor dashboard components | `socket-server.ts` helpers |
| `instructor:<sessionId>` | Instructor socket only | `handler.ts` |

## participant:join_room

React components that need broadcast events but don't go through the full
`EVENTS.PARTICIPANT_JOIN` flow emit `"participant:join_room" { room: "session:<code>" }`.
`handler.ts` validates the room name and joins the socket — see handler.ts for details.

---

## Decision log

**Why not merge?**  
EVENTS strings are stable WebSocket contracts used by the instructor client.
Changing them would break the bidirectional handler. REALTIME_EVENTS are newer,
typed, and used by React hooks. Merging requires coordinating both sides.

**Future recommendation**  
Once the instructor client is migrated from WebSocket commands to Server Actions,
EVENTS can be deprecated and REALTIME_EVENTS becomes the sole broadcast system.
