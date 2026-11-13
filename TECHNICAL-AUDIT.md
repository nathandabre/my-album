# My Album technical audit

Audit scope: tracked application source, configuration, Prisma schema, upload and
download flows, and the Next.js and Express entry points. The local `.env` was
not read or included in this report.

## Findings

| ID | Severity | Affected file(s) | Issue and recommended fix | Depends on |
| --- | --- | --- | --- | --- |
| A1 | Critical | `server/src/middleware/auth.ts` | Express trusts the client-controlled `x-user-id` header to select a database user. Any caller can impersonate a synced user. Verify Clerk's server session using the supported Clerk Express middleware, or remove the unused API service. | None |
| A2 | Critical | `src/app/a/[shareSlug]/page.tsx`, `src/app/api/albums/[shareSlug]/downloads/[assetId]/route.ts` | Public page, metadata, and download access are evaluated independently. Metadata reads private/password-album title, description, owner and cover before access checks; the page trusts a cookie containing only `"true"`. Centralize album access checks, avoid protected metadata, and verify a signed, expiring album-access token on every protected request. | A3 |
| A3 | Critical | `src/app/actions/albums.ts`, `server/src/controllers/albumController.ts` | Album passwords are unsalted SHA-256, password verification has no throttling, and Express's password endpoint does not establish access state. Use an adaptive password hash, generic failures, throttling, and cryptographically verified expiring access tokens; migrate legacy hashes on successful verification. | None |
| A4 | High | `src/app/actions/photos.ts`, `src/components/gallery/public-gallery.tsx`, `server/src/controllers/photoController.ts` | Guest favorites accept arbitrary client-supplied guest IDs and photo IDs and do not check whether the album is currently accessible. Validate payloads, limit abusive requests, and check photo-to-album access before reading or mutating favorites. | A2 |
| A5 | High | `src/app/api/upload-auth/route.ts`, `src/lib/imagekit.ts`, `src/app/actions/photos.ts`, `src/components/albums/album-editor.tsx` | Upload authorization is only sign-in gated, not album-owner scoped. The browser supplies file metadata and a path that are not verified against ImageKit, allowing forged database records; MIME type and size are not verified from stored file content. Scope upload authorization to owned albums, verify ImageKit file details server-side before recording, and bound accepted media. | A6 |
| A6 | High | `src/lib/imagekit.ts`, `src/components/gallery/public-gallery.tsx`, download route | Album media is delivered from permanent public ImageKit URLs, so hiding download buttons or restricting the download route cannot prevent retrieval once a browser is authorized to display it. Keep the current public-delivery limitation explicit; a true private-download model requires private storage and short-lived signed delivery URLs. Enforce `allowDownload` on the server regardless. | A2 |
| A7 | High | `server/src/server.ts`, `server/src/controllers/*`, `server/src/routes/*`, `src/app/actions/*` | Express duplicates album/photo operations already used by Next.js Server Actions, with differing validation, defaults and authorization. No in-repository client references the Express routes. Consolidate on the Next.js application and remove the orphan server after confirming its package scripts and routes are not referenced by app code. | None |
| A8 | High | `src/app/actions/albums.ts`, `src/app/actions/photos.ts` | Server Action inputs are TypeScript-only and are untrusted at runtime. Validate every boundary, including enum values, dates, lengths, IDs, list bounds and booleans. Keep database writes ownership-constrained and use transactions for coupled writes. | None |
| A9 | Medium | `src/app/a/[shareSlug]/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/albums/[id]/page.tsx` | Gallery reads return all photos and related favorites without pagination. Large albums can consume excessive memory and slow SSR. Add bounded pagination or lazy loading as part of the gallery data-flow change. | A2 |
| A10 | Medium | `prisma/schema.prisma` | Existing owner and album query indexes are limited; favorites are unique by `(photoId, guestId)`, but query access and deletion behavior should be reviewed against the live usage patterns. Preserve foreign keys and add only measured indexes through a safe migration. | A4 |
| A11 | Medium | `src/app/actions/photos.ts`, `src/components/albums/album-editor.tsx` | Multi-step photo/cover operations are transactional in one action, but other mutations and the duplicated Express implementation differ. Use ownership-scoped operations and transactions consistently; delete external media only after database success, with retryable orphan cleanup. | A5, A7 |
| A12 | Medium | `package.json`, project root | No automated test framework or tests are present. Add isolated tests for password/access decisions, authorization, input validation and upload metadata verification before claiming production readiness. | A2, A3, A5 |
| A13 | Low | `README.md`, `.env.example` | Setup documentation omits the Express service's security model, production migration/build checks, security headers, operational verification and variable purposes. Document the retained architecture and deployment checks after implementation. | A7, A12 |

## Implementation order

1. Remove the unused duplicate Express service and its dependencies after
   confirming no in-repository consumer.
2. Add centralized album visibility, expiry, ownership and password-token
   verification, and apply it to the public page, metadata, downloads and
   guest-facing actions.
3. Replace SHA-256 with adaptive password hashing, support safe legacy-hash
   upgrades, add bounded verification attempts and signed expiring cookies.
4. Validate server-action/upload inputs, enforce owner-scoped upload signing,
   verify ImageKit metadata before database writes, and prevent incomplete
   multi-record state.
5. Add focused automated tests, then update deployment and operational docs.
6. Run lint, type-check, tests and a production build; record service-dependent
   checks that cannot run without configured external credentials.

## Implementation status

| ID | Status |
| --- | --- |
| A1 | Fixed by removing the unreferenced Express service and its trusted-header auth. |
| A2 | Fixed for gallery pages, metadata, media streaming and downloads with one shared access policy; protected metadata is generic/noindex when access is denied. |
| A3 | Fixed for new passwords with bcrypt, signed 12-hour access cookies, legacy SHA-256 verification/upgrade, and persisted five-attempt lockouts. |
| A4 | Fixed guest identity with a signed HTTP-only cookie and authorize album access before favorite reads/writes. |
| A5 | Fixed for new uploads: album-owner-scoped upload authorization, private upload flag, provider detail lookup, file signature/dimension/size/duration checks, and best-effort orphan cleanup. |
| A6 | Partially fixed: new files are private and proxied through access checks using short-lived ImageKit signed URLs. Existing files are still public until explicitly converted/re-uploaded. |
| A7 | Fixed by consolidating the application on Next.js and removing Express-only dependencies/routes. |
| A8 | Improved with Zod validation at album, photo, favorite, password, and upload boundaries. |
| A9 | Open: large albums are still fetched/rendered as one collection; pagination is a follow-up. |
| A10 | Improved with a reverse favorites index and a persisted lockout table; no unrelated indexes were added. |
| A11 | Improved with transactional photo/album DB deletion and best-effort ImageKit cleanup. Failed external cleanup is logged and surfaced for photo deletion; no retry worker is configured. |
| A12 | Partially fixed: focused unit tests cover access policy, password hashing/legacy upgrade, media signatures, and signed URLs. No DB-backed integration or browser E2E suite exists yet. |
| A13 | Improved with environment, migration, storage-privacy, and deployment documentation. |

## Audit limitations

- The audit does not inspect `.env` values or connect to a configured production
  database, Clerk tenant, or ImageKit account.
- No pre-existing migration history was present in `prisma/migrations`; live
  database drift and existing album-password hash formats can only be verified
  with a safely isolated database snapshot.
- Existing ImageKit files remain directly retrievable if they were uploaded
  with public delivery. New uploads are private and access-checked through the
  application, but old files require conversion or re-upload to remove their
  public delivery paths.
- The new migration was generated but not applied. Apply it only after confirming
  the target database and Prisma migration history; it adds tables, columns and
  an index without deleting existing data.
