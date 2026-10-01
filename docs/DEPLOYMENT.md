# Deployment Guide — Live Training Quiz Platform

## Prerequisites

- Node.js 22+
- PostgreSQL database (Neon, Supabase, Railway, or self-hosted)
- Vercel account (recommended) or any Node.js hosting

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `AUTH_SECRET` | ✅ | Random 32-byte secret: `openssl rand -base64 32` |
| `AUTH_URL` | ✅ | Full public URL of your deployment (no trailing slash) |
| `NEXTAUTH_URL` | ✅ | Same as AUTH_URL (read by next.config.ts for allowedOrigins) |
| `SESSION_SECRET` | ✅ | Signs participant JWT cookies — set independently from AUTH_SECRET |
| `NEXT_PUBLIC_PARTICIPANT_URL` | ✅ | Stable public participant domain used exclusively for QR/join links. Never set this to a Vercel Preview URL. |
| `OPENAI_API_KEY` | ⚠️ | One of OPENAI_API_KEY or ANTHROPIC_API_KEY is required. Supports PDF extraction, daily generation, and final questions. |
| `ANTHROPIC_API_KEY` | ⚠️ | One of ANTHROPIC_API_KEY or OPENAI_API_KEY is required. Supports PDF extraction, daily generation, and final questions. |
| `AI_PROVIDER` | ❌ | Optional explicit provider: `openai` or `anthropic`. If omitted, the app auto-selects a configured provider. |
| `BLOB_READ_WRITE_TOKEN` | ⚠️ | Vercel Blob token; if absent, files saved to local disk (not for production) |
| `LLAMA_CLOUD_API_KEY` | ❌ | Optional secondary PDF extraction provider |

> **Security**: Never commit real values. Use Vercel's Environment Variables UI or your hosting provider's secret management.

---

## Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Apply schema to database (first deploy)
npx prisma migrate deploy

# Or push schema directly (development only)
npx prisma db push
```

---

## Vercel Deployment

1. Push code to GitHub
2. Import repository in Vercel dashboard
3. Set all environment variables in **Project Settings → Environment Variables**
4. Deploy — Vercel runs `npm run build` automatically

### Important Vercel Settings

- **Framework Preset**: Next.js
- **Node.js Version**: 22.x
- **Root Directory**: (leave empty — project is at repo root)
- **Build Command**: `npx prisma generate && next build`
  - Add `npx prisma generate &&` prefix to ensure Prisma client is generated before build

### Build Command (Vercel)

In `package.json` the `build` script should be:
```json
"build": "prisma generate && next build"
```

Or set it in Vercel's build settings:
```
npx prisma generate && next build
```

---

## Database Migration (Production)

Run migrations before each deployment that includes schema changes:

```bash
npx prisma migrate deploy
```

This is safe to run multiple times — it only applies pending migrations.

---

## First Instructor Account

After deploying, seed the first admin account via Prisma Studio or a direct DB insert:

```sql
INSERT INTO instructors (id, email, password_hash, name, role, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'admin@example.com',
  '$2b$10$...', -- bcrypt hash of password
  'Admin',
  'ADMIN',
  true,
  now(),
  now()
);
```

Or use `npx prisma studio` to create the record visually.

---

## Health Check

After deployment, verify:

1. `GET /` → redirects to `/login` (unauthenticated)
2. `GET /login` → shows login form
3. `GET /join` → shows join form
4. Login with instructor credentials → redirects to `/dashboard`
5. Create/open a session and verify the displayed QR target starts with the stable `NEXT_PUBLIC_PARTICIPANT_URL` and `/join/<CODE>`
6. Scan QR from a signed-out phone/browser → it must open the participant name form directly, never a Vercel login/protection screen

---

## Known Limitations

- File storage without `BLOB_READ_WRITE_TOKEN` writes to local disk — data is lost on Vercel restarts. Set Vercel Blob for production.
- No rate limiting on join endpoint — consider adding Upstash Rate Limit for large deployments.
- Polling uses HTTP short-polling (5–8s intervals) — suitable for sessions up to ~200 concurrent participants. For larger scale, consider WebSockets or SSE.
