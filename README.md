# My Album

Digital photo albums for photographers: create an album, upload media, and
share a link.

## Architecture

- Next.js 16 App Router is the only application/API service.
- Clerk is the authentication source of truth; server actions and Route
  Handlers verify the Clerk session and database ownership.
- Prisma 7 with PostgreSQL stores users, albums, media metadata, and password
  attempt lockouts.
- Album uploads are streamed through an authenticated Next.js Route Handler.
  The server chooses the ImageKit folder, filename, and private setting; client
  upload fields are not forwarded. New uploads are checked against ImageKit
  metadata before photo records are created.
- ImageKit files are delivered through access-checked Next.js routes using
  short-lived signed ImageKit URLs.
- Media deletions are durably queued in PostgreSQL and retried by a
  secret-protected cleanup Route Handler.
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
| `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY` | ImageKit public key | Public |
| `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` | ImageKit delivery endpoint | Public |
| `IMAGEKIT_PRIVATE_KEY` | ImageKit metadata, delete, and signed-URL API access | Server-only |
| `CRON_SECRET` | Bearer secret for the scheduled media-cleanup worker | Server-only |

`CLERK_SECRET_KEY`, `IMAGEKIT_PRIVATE_KEY`, and `CRON_SECRET` must be configured
in the hosting provider's encrypted environment settings, not source control.
Password failures share a persisted per-album lockout bucket and do not trust
client-supplied forwarded-IP headers.

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

   The follow-up migrations add password-attempt lockout storage, private-media
   flags, upload quotas, retryable media cleanup, privacy-migration progress,
   and a favorites query index; they do not delete existing media rows.
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
| `npm run test:integration` | PostgreSQL integration tests (requires `TEST_DATABASE_URL`) |
| `npm run test:e2e` | Playwright public-route smoke tests (requires isolated `E2E_BASE_URL`) |
| `npm run media:migrate:dry-run` | Report public media without changes |
| `npm run media:migrate:apply -- --limit=25` | Explicitly migrate a bounded media batch |

Do not use `db:push` for production deployments. Do not reset or recreate a
production database.

For browser smoke tests, install Chromium and explicitly target a disposable
local or staging deployment:

```bash
npx playwright install chromium
E2E_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

The Playwright configuration does not start a server automatically, so tests
cannot silently bind to whatever database happens to be in `.env`. The current
browser tests cover the public landing page, auth route availability, and
unauthenticated dashboard redirect. Full Clerk account creation, media upload,
sharing, password-gate, and download journeys still require a dedicated
Clerk/ImageKit staging setup and are not represented as verified here.

## Existing public ImageKit media migration

The migration utility defaults to a dry run. It enumerates database media still
marked public, verifies each source file with ImageKit, and reports what it
would do without changing storage or records:

```bash
npm run media:migrate:dry-run
```

After backing up PostgreSQL and confirming the account is configured for private
files and signed delivery, process a small batch explicitly:

```bash
npm run media:migrate:apply -- --limit=25 --batch-size=5
```

The utility records per-asset progress in `MediaPrivacyMigration`, creates a
deterministically named private replacement inside the same album folder, and
verifies its ImageKit file ID, path, and `isPrivateFile` status before changing
the database pointer. Re-run the command to retry failed assets or continue in
further batches. It does not delete an original inline. Replacing a public
asset also queues the old file for the durable cleanup worker in the same
transaction that switches the database pointer. The worker deletes it only
after confirming the replacement is live and no database record still
references the original. A structured JSON-line report is emitted; do not
capture credentials in shell logs. The application does not run this migration
automatically.

Old public files remain available until the cleanup worker processes their
queued jobs; previously distributed URLs or cached copies may remain accessible
even after origin deletion. This utility does not purge CDN caches. Verify
ImageKit's cache invalidation behavior and handle any required purge separately.

## Cleanup worker

Deleted photo/album files and failed orphan uploads are written to
`MediaCleanupJob` transactionally. The worker claims a bounded batch, checks
that a file is no longer referenced, validates its album folder in ImageKit,
and retries with exponential backoff. After ten failures it marks a job
`FAILED`.

Configure a scheduler to call `GET /api/internal/media-cleanup` periodically
with `Authorization: Bearer <CRON_SECRET>`. Failed jobs can be retried by
calling the same route with `POST` and a JSON body
`{"retryJobIds":["<job-id>"]}`. Keep the secret in the scheduler's encrypted
settings. The worker does not need Redis or a separately running process.

## Deployment

1. Provision PostgreSQL and take a verified backup before the first migration.
2. Configure the Clerk application for the production domain and add all Clerk
   and ImageKit variables from the table above to the deployment environment.
3. Confirm the ImageKit account permits private files and signed delivery.
   Uploads pass through the app server, which chooses the folder, filename, and
   `isPrivateFile: true` setting. Registration verifies ImageKit's file
   details, actual file signature, album folder, dimensions, size, and video
   duration before inserting metadata. The hosting platform must support the
   configured maximum request size and execution duration; some serverless
   platforms impose limits below the app's 2 GB video cap.
4. Deploy using the lockfile, then run `npm run db:migrate:deploy` against the
   intended database. This checked-in migration is additive. If the existing
   database has not previously been managed by Prisma Migrate, verify/baseline
   its migration history with a database administrator before deploying.
5. Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
6. Smoke-test sign-in, owner-only album editing, private/password/unlisted
   access, password lockout, private media display, and both allowed/denied
   downloads in a staging environment.
7. Configure the cleanup scheduler and test retrying a failed job in staging.

The password lockout threshold is five failures in 15 minutes followed by a
15-minute lock. Album access cookies expire after 12 hours and are invalidated
when the album is updated. Guest-session cookies expire after 90 days. Cookies
are HTTP-only, SameSite=Lax, and Secure in production.

### Existing ImageKit files

Files uploaded before this change may still be public at ImageKit even though
the app now proxies access and does not send their ImageKit paths to gallery
clients. Run the explicit public-media migration described above in small
batches; never manually set `isPrivate` in PostgreSQL unless ImageKit confirms
the corresponding file is private.

### Media download limitation

`allowDownload` is enforced by the download Route Handler. A browser that can
display an image or video can still save or capture that content; the setting
does not provide DRM or absolute download prevention. New media is private at
ImageKit and served through album authorization checks. Existing public
ImageKit files remain retrievable by anyone who already knows their original
URL until they are converted and the cleanup worker deletes the original;
previously cached copies may remain accessible.

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Landing page |
| `/sign-in`, `/sign-up` | Clerk authentication |
| `/dashboard` | Photographer album dashboard |
| `/a/[shareSlug]` | Access-checked shared gallery |
| `/api/albums/[album]/upload` | Owner-authorized streaming upload proxy (`album` is the album ID) |
| `/api/albums/[album]/photos` | Access-checked cursor-paginated gallery (`album` is the share slug) |
| `/api/albums/[album]/media/[assetId]` | Access-checked, private media streaming (`album` is the share slug) |
| `/api/albums/[album]/downloads/[assetId]` | Access-checked download streaming (`album` is the share slug) |
| `/api/internal/media-cleanup` | Secret-protected cleanup worker and retry endpoint |
