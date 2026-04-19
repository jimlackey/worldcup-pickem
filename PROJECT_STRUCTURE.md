worldcup-pickem/
├── .env.local.example          # All required environment variables
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
│
├── supabase/
│   └── migrations/
│       ├── 001_schema.sql          # Tables, enums, indexes, RLS, triggers
│       ├── 002_seed_tournament.sql # Tournament, groups, teams, matches
│       └── 003_helpers.sql         # DB functions (standings, scoring init)
│
├── scripts/
│   └── seed-demo.ts               # Idempotent demo pool seeder (Section 10)
│
├── public/
│   └── fallback-flag.svg           # Grey pill fallback for missing flags
│
└── src/
    ├── app/
    │   ├── layout.tsx              # Root layout: fonts, metadata, providers
    │   ├── page.tsx                # Landing: list pools or redirect
    │   ├── globals.css             # Tailwind directives + CSS variables
    │   │
    │   └── [poolSlug]/
    │       ├── layout.tsx          # Pool layout: fetches pool by slug, provides context
    │       ├── page.tsx            # Pool home: login form or redirect to standings
    │       │
    │       ├── standings/
    │       │   └── page.tsx        # Public standings leaderboard
    │       │
    │       ├── picks/
    │       │   └── page.tsx        # Public picks grid (TanStack Table)
    │       │
    │       ├── match/
    │       │   └── [matchId]/
    │       │       └── page.tsx    # Game drill-down (public)
    │       │
    │       ├── my-picks/
    │       │   ├── page.tsx        # My Pick Sets dashboard (auth required)
    │       │   └── [pickSetId]/
    │       │       ├── page.tsx        # Edit pick set (group picks form)
    │       │       └── knockout/
    │       │           └── page.tsx    # Knockout bracket picker
    │       │
    │       ├── admin/
    │       │   ├── layout.tsx      # Admin layout: role gate
    │       │   ├── page.tsx        # Admin dashboard home
    │       │   ├── matches/
    │       │   │   └── page.tsx    # Match result entry
    │       │   ├── knockout-setup/
    │       │   │   └── page.tsx    # Populate knockout bracket teams
    │       │   ├── players/
    │       │   │   └── page.tsx    # Player + pick set management
    │       │   ├── csv-import/
    │       │   │   └── page.tsx    # CSV upload + preview
    │       │   ├── settings/
    │       │   │   └── page.tsx    # Pool settings, scoring, dates, whitelist
    │       │   └── audit-log/
    │       │       └── page.tsx    # Audit log viewer
    │       │
    │       └── auth/
    │           ├── login/
    │           │   └── page.tsx    # Email entry + OTP form
    │           └── actions.ts      # Server actions: requestOtp, verifyOtp, logout
    │
    ├── lib/
    │   ├── supabase/
    │   │   ├── server.ts           # Service-role Supabase client (server only)
    │   │   └── types.ts            # Generated DB types (from Supabase CLI)
    │   │
    │   ├── auth/
    │   │   ├── session.ts          # Cookie read/write, session validation
    │   │   ├── otp.ts              # OTP generation, hashing, verification
    │   │   └── middleware.ts       # Auth check for protected routes
    │   │
    │   ├── email/
    │   │   └── resend.ts           # Resend client + OTP email template
    │   │
    │   ├── audit/
    │   │   └── log.ts              # logAuditEvent() — shared server utility
    │   │
    │   ├── pool/
    │   │   ├── queries.ts          # Pool CRUD, membership, whitelist queries
    │   │   └── context.ts          # React context for current pool
    │   │
    │   ├── tournament/
    │   │   ├── queries.ts          # Teams, groups, matches — pool-scope-aware
    │   │   └── standings.ts        # Standings calculation (calls DB function)
    │   │
    │   ├── picks/
    │   │   ├── queries.ts          # Pick sets, group picks, knockout picks CRUD
    │   │   └── validation.ts       # Lock time checks, limit enforcement
    │   │
    │   └── utils/
    │       ├── flags.ts            # Flag URL builder + fallback logic
    │       ├── constants.ts        # Phases, default scoring, etc.
    │       └── csv.ts              # CSV parse + validate for import
    │
    ├── components/
    │   ├── ui/                     # Shared primitives
    │   │   ├── button.tsx
    │   │   ├── input.tsx
    │   │   ├── card.tsx
    │   │   ├── modal.tsx
    │   │   ├── badge.tsx
    │   │   ├── spinner.tsx
    │   │   └── toast.tsx
    │   │
    │   ├── layout/
    │   │   ├── nav-bar.tsx         # Pool-scoped nav (hamburger on mobile)
    │   │   ├── pool-header.tsx     # Pool name + context
    │   │   └── mobile-nav.tsx      # Bottom nav or slide-out menu
    │   │
    │   ├── flags/
    │   │   └── team-flag.tsx       # <TeamFlag> component with fallback
    │   │
    │   ├── standings/
    │   │   ├── standings-table.tsx  # Desktop table view
    │   │   ├── standings-cards.tsx  # Mobile card layout
    │   │   └── what-if-toggle.tsx   # What-If mode controls
    │   │
    │   ├── picks/
    │   │   ├── picks-grid.tsx       # TanStack Table virtualized grid
    │   │   ├── match-pick-card.tsx   # Home/Draw/Away selector card
    │   │   └── pick-set-card.tsx     # Pick set summary card
    │   │
    │   ├── knockout/
    │   │   ├── bracket-view.tsx      # Full bracket visualization
    │   │   ├── bracket-picker.tsx    # Interactive bracket selector
    │   │   └── bracket-round.tsx     # Single round column
    │   │
    │   ├── match/
    │   │   ├── match-card.tsx        # Match display with flags + score
    │   │   └── game-drilldown.tsx    # Full match detail modal/page
    │   │
    │   └── admin/
    │       ├── result-entry-form.tsx  # Match result + score entry
    │       ├── knockout-team-picker.tsx # Assign teams to knockout slots
    │       ├── player-table.tsx       # Player management table
    │       ├── csv-uploader.tsx       # CSV upload + preview + commit
    │       ├── scoring-editor.tsx     # Scoring config editor
    │       ├── whitelist-editor.tsx   # Email whitelist manager
    │       └── audit-log-table.tsx    # Audit log with filters
    │
    ├── types/
    │   ├── database.ts             # TypeScript types mirroring DB schema
    │   ├── api.ts                  # Request/response shapes
    │   └── picks.ts                # Pick-related types
    │
    └── middleware.ts               # Next.js middleware: session validation,
                                    # pool slug resolution, auth redirects
