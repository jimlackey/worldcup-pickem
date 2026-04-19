# World Cup Pick'em — Setup Guide

## Prerequisites

- Node.js 18+ and npm
- A Supabase project (free tier works: [supabase.com](https://supabase.com))
- A Resend account (free tier: [resend.com](https://resend.com))

---

## Step 1: Create Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project
2. Note your:
   - **Project URL** (Settings → API → Project URL)
   - **anon key** (Settings → API → Project API keys → `anon` `public`)
   - **service_role key** (Settings → API → Project API keys → `service_role` `secret`)

## Step 2: Run Database Migrations

Open the **SQL Editor** in your Supabase dashboard.

### Option A: Single combined migration (easiest)
1. Open `supabase/migrations/000_combined.sql`
2. Paste the entire contents into the SQL Editor
3. Click **Run**

### Option B: Run migrations individually (if you prefer)
Run each file in order:
1. `supabase/migrations/001_schema.sql` — Tables, enums, indexes, RLS, triggers
2. `supabase/migrations/002_seed_tournament.sql` — Tournament data (48 teams, 72 group matches, 31 knockout slots)
3. `supabase/migrations/003_helpers.sql` — DB functions (standings, scoring init)

### Verify
After running migrations, paste and run `supabase/verify.sql` in the SQL Editor. Every check should show ✅ (except UK flag codes which show ⚠️ as an informational note).

## Step 3: Configure Environment

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=onboarding@resend.dev
SESSION_SECRET=<run: openssl rand -hex 32>
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_TOURNAMENT_ID=00000000-0000-0000-0000-000000000001
```

Generate a session secret:
```bash
openssl rand -hex 32
```

## Step 4: Install Dependencies

```bash
npm install
```

## Step 5: Create Your First Pool

```bash
env $(cat .env.local | xargs) npx tsx scripts/setup-pool.ts
```

This interactive script will ask you for:
- Pool name and URL slug
- Admin email and display name
- Max pick sets per player
- Whitelist emails

It creates the pool, scoring config, admin participant, admin membership, and whitelist entries in one go.

## Step 6: Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` — you should see your pool listed on the landing page.

Visit `http://localhost:3000/your-pool-slug` to access your pool.

---

## Database Structure Overview

### Global (shared across all non-demo pools)
| Table | Rows | Purpose |
|-------|------|---------|
| `tournaments` | 1 | 2026 FIFA World Cup |
| `groups` | 12 | Groups A–L |
| `teams` | 48 | All qualified teams with flag codes |
| `matches` | 103 | 72 group + 31 knockout slots |

### Per-Pool
| Table | Purpose |
|-------|---------|
| `pools` | Pool config (name, slug, lock times) |
| `pool_memberships` | Who's in each pool + their role |
| `pick_sets` | Named pick entries per player |
| `group_picks` | Group phase picks (home/draw/away) |
| `knockout_picks` | Knockout bracket picks (team ID) |
| `scoring_config` | Points per phase |
| `pool_whitelist` | Allowed emails |
| `otp_requests` | Login code tracking |
| `sessions` | Active login sessions |
| `audit_log` | Append-only event log |

### Demo Pool Independence
Demo pools (`is_demo = true`) get their own copies of `teams`, `groups`, and `matches` (via `pool_id` column). This means demo results don't affect real pools.

---

## Common Tasks

### Add a user to a pool's whitelist (SQL)
```sql
INSERT INTO pool_whitelist (pool_id, email)
VALUES ('your-pool-id', 'newuser@example.com');
```

### Promote a user to admin (SQL)
```sql
UPDATE pool_memberships
SET role = 'admin'
WHERE pool_id = 'your-pool-id'
  AND participant_id = (
    SELECT id FROM participants WHERE email = 'user@example.com'
  );
```

### Reset demo pools
```bash
env $(cat .env.local | xargs) npx tsx scripts/seed-demo.ts
```
(Available after Section 10)

### Clean up expired sessions/OTPs
```sql
SELECT cleanup_expired_sessions();
SELECT cleanup_expired_otps();
```
Consider running these on a cron schedule via Supabase's pg_cron extension.
