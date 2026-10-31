# my-album

Digital photo albums for photographers — create an album, upload photos, share a link.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind CSS
- **Clerk** — authentication
- **Prisma** + **PostgreSQL** (Neon recommended)
- **ImageKit** — image uploads + CDN delivery
- **shadcn/ui** — UI primitives
- **Vercel** — deploy target

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env vars and fill them in:

```bash
cp .env.example .env
```

Required accounts:

- [Neon](https://neon.tech) (or any Postgres) → `DATABASE_URL`
- [Clerk](https://dashboard.clerk.com) → publishable + secret keys
- [ImageKit](https://imagekit.io/dashboard) → public key, private key, URL endpoint

3. Generate Prisma Client and push the schema:

```bash
npm run db:generate
npm run db:push
```

4. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local Next.js server |
| `npm run build` | Production build |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:push` | Push schema to the database (no migration files) |
| `npm run db:migrate` | Create/apply migrations |
| `npm run db:studio` | Open Prisma Studio |

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Landing |
| `/sign-in`, `/sign-up` | Clerk auth |
| `/dashboard` | Photographer album dashboard (stub) |
| `/a/[shareSlug]` | Public shared album (stub) |
| `/api/upload-auth` | ImageKit upload auth (signed-in only) |

## Deploy (Vercel)

1. Push the repo and import it in Vercel.
2. Add the same env vars from `.env.example`.
3. Deploy — `prisma generate` runs on install via `postinstall`.
