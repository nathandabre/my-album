# Operations

## Database migrations and existing databases

For a new, empty PostgreSQL database, apply the checked-in migrations:

```bash
npm run db:migrate:deploy
```

For an existing database that already contains My Album tables but has no
Prisma migration history, first compare it with the legacy schema:

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/legacy-schema.prisma --exit-code
```

Only if the comparison reports no differences, baseline the initial migration
and apply later additive migrations:

```bash
npx prisma migrate resolve --applied 0_init
npm run db:migrate:deploy
```

If the comparison reports differences or errors, stop and investigate before
baselining. Do not use `db push` or reset a database containing data. For Neon,
use a direct, non-pooled connection for migration commands if the pooler times
out while acquiring Prisma's advisory lock. Back up the database and verify
the target before applying migrations.

The checked-in migrations add lockout and media-cleanup storage, private-media
flags, upload quotas, privacy-migration progress, and indexes. They do not drop
tables or columns.

## Migrating existing public ImageKit media

The migration utility defaults to a dry run. It enumerates database media still
marked public, verifies each source file and album folder with ImageKit, and
reports what it would do without changing storage or records:

```bash
npm run media:migrate:dry-run
```

Back up PostgreSQL and confirm that the ImageKit account supports private files
and signed delivery before applying a small batch:

```bash
npm run media:migrate:apply -- --limit=25 --batch-size=5
```

The utility records per-asset progress in `MediaPrivacyMigration`, creates a
deterministically named private replacement in the same album folder, and
verifies its ImageKit file ID, path, and private status before changing the
database pointer. Re-run it to retry failed assets or continue in further
batches. It does not delete the original inline. Replacing a public asset queues
the old file for cleanup in the same transaction that switches the database
pointer. The worker deletes it only after confirming that no database record
references it. The utility emits structured JSON-line progress and a summary;
avoid capturing credentials in shell logs. The application does not run this
migration automatically.

Old public files remain available until the cleanup worker processes their
queued jobs. Previously distributed URLs and cached copies may remain
accessible after origin deletion; this utility does not purge CDN caches.
Verify ImageKit's cache-invalidation behavior and handle any required purge
separately. Never set `isPrivate` in PostgreSQL manually unless ImageKit
confirms that the corresponding file is private.

## Scheduling the media-cleanup worker

Deleted photo/album files and failed orphan uploads are written to
`MediaCleanupJob` transactionally. Schedule a request to
`GET /api/internal/media-cleanup` with an `Authorization: Bearer` header whose
value is the configured `CRON_SECRET`. Store the secret in the scheduler's
encrypted settings; do not put its value in source control or command logs.

The worker claims a bounded batch, checks that each file is no longer
referenced, and retries ImageKit deletion with exponential backoff. After ten
failed attempts it marks a job `FAILED`. Stale processing leases are reclaimed.
Failed jobs can be retried by an authorized `POST` to the same route with a
JSON body:

```json
{"retryJobIds":["<job-id>"]}
```

The endpoint does not require Redis or a separately running process. Test the
scheduler and retry flow against a non-production environment before relying on
it in production.
