# Architecture — Live Training Quiz Platform

## Stack Overview

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| ORM | Prisma 6 |
| Database | PostgreSQL (Neon / Supabase / Railway) |
| Auth | Auth.js v5 (NextAuth) — JWT strategy |
| File Storage | Vercel Blob (optional; falls back to local disk) |
| AI | Anthropic Claude (question generation) |
| Deployment | Vercel |

---

## Directory Structure

```
src/
  app/
    api/
      auth/          NextAuth handlers
      documents/     PDF upload, processing, status
      session/
        [code]/
          analytics/   Instructor: live analytics
          export/      Instructor: Excel export
          leaderboard/ Instructor: ranked participants
          participants/Instructor: participant list
          state/       Trainee: current session state (no correct answers)
          stats/       Instructor: session summary stats
        answer/        Trainee: submit answer
    programs/          Instructor pages (dashboard, sessions, results)
    session/[code]/    Trainee pages (join, quiz, result)
    join/              Trainee entry page
  components/
    session/           Live-polling client components (instructor)
  lib/
    auth.ts            NextAuth configuration
    auth.config.ts     Edge-compatible middleware auth config
    prisma.ts          Prisma client singleton
    session/
      service.ts       Core session business logic
      guest-token.ts   Participant JWT (guest_token cookie)
  app/actions/         Next.js Server Actions (instructor operations)
```

---

## Authentication

### Instructors
- Credentials-based login (email + bcrypt password)
- JWT session stored in `sessionToken` cookie (httpOnly, secure in prod)
- `session.user.id` = instructor's UUID from the `instructors` table
- All instructor API routes check `auth()` and verify `session.instructorId === userId`

### Participants (Trainees)
- No account required — identified by a signed `guest_token` JWT cookie
- Cookie issued on `/join/[code]` POST after entering display name
- Signed with `SESSION_SECRET` (falls back to `AUTH_SECRET`)
- Contains `{ sessionId, participantId, displayName }`
- Verified server-side on every `/api/session/[code]/state` and `/api/session/answer` call

### Middleware (Edge)
- `src/middleware.ts` uses `authConfig` (no Node.js modules) for route protection
- Public routes: `/login`, `/api/auth/*`, `/join/*`, `/session/*`, `/api/session/*`
- All other routes require instructor session

---

## Session Lifecycle

```
DRAFT → ACTIVE → PAUSED → ACTIVE → ENDED
```

### Question States
```
DRAFT → READY → LIVE → CLOSED → RESULTS
```

- **LIVE**: participants can answer; `correctOptionId` never sent
- **CLOSED**: answers locked; `correctOptionId` still hidden
- **RESULTS**: `correctOptionId` revealed via `buildQuestionResult()` — instructor only

---

## Security Invariants

1. `correctOptionId` is NEVER included in any participant-facing API response
2. `isCorrect` is only returned to the participant for their own submitted answer
3. All instructor APIs verify both authentication and session ownership
4. Scores computed entirely server-side in `service.ts`
5. Participant identity uses signed JWT — cannot be forged without `SESSION_SECRET`

---

## Data Models (Key)

- `LiveSession` — one session per training day; owned by an instructor
- `SessionParticipant` — one per trainee per session; holds cumulative score
- `SessionQuestion` — junction: session ↔ question, tracks display state
- `ParticipantAnswer` — immutable answer record; `isCorrect` set server-side
- `SessionResult` — pre-aggregated final stats (written on session end)

---

## Polling Architecture

Client components on the instructor page poll their respective APIs:

| Component | Endpoint | Interval |
|-----------|----------|----------|
| SessionLiveStats | `/api/session/[code]/stats` | 5s |
| SessionParticipantsList | `/api/session/[code]/participants` | 5s |
| SessionAnalyticsDashboard | `/api/session/[code]/analytics` | 8s |
| SessionLeaderboard | `/api/session/[code]/leaderboard` | 8s |

All intervals are cleared via `useEffect` cleanup — no memory leaks.
Polling stops automatically when `isEnded=true` is passed.
