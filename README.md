# My Album

Digital photo albums for photographers: create an album, upload media, and
share a link.

## Architecture

- Next.js 16 App Router is the only application/API service.
- Clerk is the authentication source of truth; server actions and Route
  Handlers verify the Clerk session and database ownership.
- Prisma 7 with PostgreSQL stores users, albums, media metadata, and password
  attempt lockouts.
- ImageKit handles direct uploads. New uploads are marked private and are
  delivered through access-checked Next.js routes using short-lived signed
  ImageKit URLs.
- Album access tokens and guest-session cookies are signed with a purpose-bound
  HMAC derived from the server-only Clerk secret. Passwords use bcrypt.
- The previous Express service duplicated app behavior and trusted
  `x-user-id`; it has been removed. No in-repository application code called it.

## Environment

Copy `.env.example` to `.env` for local development. Do not commit `.env` or
place server-only values in `NEXT_PUBLIC_*` variables.

| Variable | Purpose | Exposure |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | Server-only |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser SDK | Public |
| `CLERK_SECRET_KEY` | Clerk server SDK and signing-key source for album/guest tokens | Server-only |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Sign-in route | Public |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Sign-up route | Public |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Default sign-in redirect | Public |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Default sign-up redirect | Public |
| `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY` | ImageKit browser upload key | Public |
| `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` | ImageKit delivery endpoint | Public |
| `IMAGEKIT_PRIVATE_KEY` | ImageKit metadata, delete, and signed-URL API access | Server-only |

`CLERK_SECRET_KEY` and `IMAGEKIT_PRIVATE_KEY` must be configured in the hosting
provider's encrypted environment settings, not source control. The password
attempt limiter hashes the proxy-provided client address before storing it;
configure the hosting proxy to set/overwrite `x-real-ip` or `x-forwarded-for`.

## Local setup

1. Use Node.js 22 or newer and install the locked dependencies:

   ```bash
   npm ci
   ```

2. Configure PostgreSQL, Clerk, and ImageKit using `.env.example`.
3. Generate the Prisma Client:

   ```bash
   npm run db:generate
   ```

4. Prepare the database:

   - For a **new, empty database**, apply all migrations:

     ```bash
     npm run db:migrate:deploy
     ```

   - For a database that already contains My Album tables but has no Prisma
     migration history, first verify it matches the pre-migration schema:

     ```bash
     npx prisma migrate diff --from-config-datasource --to-schema prisma/legacy-schema.prisma --exit-code
     ```

     Only if that command reports no differences, baseline the existing schema
     and apply the additive migration:

     ```bash
     npx prisma migrate resolve --applied 0_init
     npm run db:migrate:deploy
     ```

     If the diff reports changes or errors, stop and investigate before
     baselining. Do not use `db push` or reset a database containing data.
     For Neon, use a direct (non-pooled) connection for migration commands if
     the pooler times out acquiring Prisma's advisory lock.

   The follow-up migration adds password-attempt lockout storage, private-media
   flags, and a favorites query index; it does not delete existing rows.
   Existing media rows default to public delivery; use the migration guidance
   below before treating those files as private.
5. Start the app:

   ```bash
   npm run dev
   ```

## Validation scripts

| Script | Purpose |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm test` | Isolated unit tests |
| `npm run build` | Generate Prisma Client and build the production app |
| `npm run db:migrate:deploy` | Apply committed migrations in a deployment |
| `npm run db:migrate` | Create/apply a migration in local development |
| `npm run db:studio` | Open Prisma Studio |

Do not use `db:push` for production deployments. Do not reset or recreate a
production database.

## Deployment

1. Provision PostgreSQL and take a verified backup before the first migration.
2. Configure the Clerk application for the production domain and add all Clerk
   and ImageKit variables from the table above to the deployment environment.
3. Confirm the ImageKit account permits private files and signed delivery. New
   uploads are uploaded with `isPrivateFile: true`; registration verifies
   ImageKit's file details, actual file signature, album folder, dimensions,
   size, and video duration before inserting metadata.
4. Deploy using the lockfile, then run `npm run db:migrate:deploy` against the
   intended database. This checked-in migration is additive. If the existing
   database has not previously been managed by Prisma Migrate, verify/baseline
   its migration history with a database administrator before deploying.
5. Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
6. Smoke-test sign-in, owner-only album editing, private/password/unlisted
   access, password lockout, private media display, and both allowed/denied
   downloads in a staging environment.

The password lockout threshold is five failures in 15 minutes followed by a
15-minute lock. Album access cookies expire after 12 hours and are invalidated
when the album is updated. Guest-session cookies expire after 90 days. Cookies
are HTTP-only, SameSite=Lax, and Secure in production.

### Existing ImageKit files

Files uploaded before this change may still be public at ImageKit even though
the app now proxies access and does not send their ImageKit paths to gallery
clients. The migration marks existing rows `isPrivate = false` to preserve
their display. Re-upload those files as private (or use an audited ImageKit
operation to convert them and update the database flags) before claiming their
underlying storage is private. Do not manually set `isPrivate` in PostgreSQL
unless the ImageKit file itself is confirmed private.

### Media download limitation

`allowDownload` is enforced by the download Route Handler. A browser that can
display an image or video can still save or capture that content; the setting
does not provide DRM or absolute download prevention. New media is private at
ImageKit and served through album authorization checks. Existing public
ImageKit files remain retrievable by anyone who already knows their original
URL until they are converted or re-uploaded.

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Landing page |
| `/sign-in`, `/sign-up` | Clerk authentication |
| `/dashboard` | Photographer album dashboard |
| `/a/[shareSlug]` | Access-checked shared gallery |
| `/api/upload-auth` | Album-owner-scoped ImageKit upload authorization |
| `/api/albums/[shareSlug]/media/[assetId]` | Access-checked, private media streaming |
| `/api/albums/[shareSlug]/downloads/[assetId]` | Access-checked download streaming |
