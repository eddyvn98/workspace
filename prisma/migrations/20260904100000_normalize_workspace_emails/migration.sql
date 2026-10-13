-- Make "the stored email is already lower-case" a fact the database enforces,
-- rather than a hope every write path has to keep.
--
-- Why this is worth a data migration: email IS the identity here (no users
-- table), and Postgres compares strings byte-for-byte. Every silent bug found
-- in this audit — a collaborator told they have no access, an invitation that
-- never appears under "shared with me", a leave that answers ok and removes
-- nothing, a hidden board with nothing left in the menu to bring it back, a
-- "last seen" watermark that jumps backwards — is the same root cause wearing
-- a different hat. Normalizing the data removes the root instead of guarding
-- each symptom.
--
-- DEDUPLICATE BEFORE LOWERCASING. Two rows spelling one person differently
-- collapse into one when lowered, which would violate a unique key (or, for
-- presence, a primary key). Each choice of which row survives is made on what
-- is least harmful if wrong, and said out loud:

-- Shares: keep the newest, because the owner's latest action is their intent.
DELETE FROM "workspace_board_shares" s
USING "workspace_board_shares" keep
WHERE s."boardId" = keep."boardId"
  AND lower(s."invitedEmail") = lower(keep."invitedEmail")
  AND (s."createdAt", s."id") < (keep."createdAt", keep."id");

-- Hidden boards: keep the newest, same reason — the last hide/unhide wins.
DELETE FROM "workspace_board_hides" h
USING "workspace_board_hides" keep
WHERE h."boardId" = keep."boardId"
  AND lower(h."userEmail") = lower(keep."userEmail")
  AND (h."hiddenAt", h."id") < (keep."hiddenAt", keep."id");

-- Watermarks: keep the OLDEST, which is the opposite choice on purpose. An
-- early watermark re-shows updates the person had already read — mildly
-- annoying. A late one hides updates they never saw — the actual damage.
DELETE FROM "workspace_board_views" v
USING "workspace_board_views" keep
WHERE v."boardId" = keep."boardId"
  AND lower(v."userEmail") = lower(keep."userEmail")
  AND (v."lastSeenAt", v."id") > (keep."lastSeenAt", keep."id");

-- Presence: keep the newest. It is a 15s heartbeat, so anything older is
-- already stale by definition.
DELETE FROM "workspace_presence" p
USING "workspace_presence" keep
WHERE p."boardId" = keep."boardId"
  AND lower(p."email") = lower(keep."email")
  AND (p."lastSeenAt", p."email") < (keep."lastSeenAt", keep."email");

-- Now normalize. Identity columns first — these are the ones every `where`
-- clause compares against.
UPDATE "workspace_boards"        SET "ownerEmail"     = lower("ownerEmail")     WHERE "ownerEmail"     <> lower("ownerEmail");
UPDATE "workspace_board_shares"  SET "invitedEmail"   = lower("invitedEmail")   WHERE "invitedEmail"   <> lower("invitedEmail");
UPDATE "workspace_board_hides"   SET "userEmail"      = lower("userEmail")      WHERE "userEmail"      <> lower("userEmail");
UPDATE "workspace_board_views"   SET "userEmail"      = lower("userEmail")      WHERE "userEmail"      <> lower("userEmail");
UPDATE "workspace_presence"      SET "email"          = lower("email")          WHERE "email"          <> lower("email");
UPDATE "workspace_board_comments" SET "authorEmail"   = lower("authorEmail")    WHERE "authorEmail"    <> lower("authorEmail");
UPDATE "workspace_notifications" SET "recipientEmail" = lower("recipientEmail") WHERE "recipientEmail" <> lower("recipientEmail");

-- Audit-trail columns: normalized for tidiness, but NOT constrained below.
-- Nothing looks a person up by these, so a stray capital is cosmetic here —
-- and a CHECK on a column no comparison depends on only buys the chance of a
-- failed write on some path this audit did not trace.
UPDATE "workspace_board_shares"      SET "invitedBy"  = lower("invitedBy")  WHERE "invitedBy"  <> lower("invitedBy");
UPDATE "workspace_notifications"     SET "actorEmail" = lower("actorEmail") WHERE "actorEmail" IS NOT NULL AND "actorEmail" <> lower("actorEmail");
UPDATE "workspace_board_snapshots"   SET "createdBy"  = lower("createdBy")  WHERE "createdBy"  <> lower("createdBy");
UPDATE "workspace_board_edit_events" SET "actorEmail" = lower("actorEmail") WHERE "actorEmail" <> lower("actorEmail");

-- Enforce it, so the invariant cannot rot back. Every workspace write path
-- already lower-cases (the caller through _auth.ts, an invitation through
-- normalizeWorkspaceEmail), so these constraints describe what the code
-- already does rather than asking it to change.
DO $$
BEGIN
    ALTER TABLE "workspace_boards"
        ADD CONSTRAINT "workspace_boards_ownerEmail_lower" CHECK ("ownerEmail" = lower("ownerEmail"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "workspace_board_shares"
        ADD CONSTRAINT "workspace_board_shares_invitedEmail_lower" CHECK ("invitedEmail" = lower("invitedEmail"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "workspace_board_hides"
        ADD CONSTRAINT "workspace_board_hides_userEmail_lower" CHECK ("userEmail" = lower("userEmail"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "workspace_board_views"
        ADD CONSTRAINT "workspace_board_views_userEmail_lower" CHECK ("userEmail" = lower("userEmail"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "workspace_presence"
        ADD CONSTRAINT "workspace_presence_email_lower" CHECK ("email" = lower("email"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "workspace_board_comments"
        ADD CONSTRAINT "workspace_board_comments_authorEmail_lower" CHECK ("authorEmail" = lower("authorEmail"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "workspace_notifications"
        ADD CONSTRAINT "workspace_notifications_recipientEmail_lower" CHECK ("recipientEmail" = lower("recipientEmail"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Records when a collaborator's role last changed. Without it, being demoted
-- from EDITOR to VIEWER leaves no trace of when, which is the one question
-- asked afterwards. Backfilled from createdAt: the role has not changed since
-- it was granted as far as anything stored can tell.
ALTER TABLE "workspace_board_shares"
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "workspace_board_shares" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "workspace_board_shares"
    ALTER COLUMN "updatedAt" SET NOT NULL,
    ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- A thread is fetched by board and read oldest-first, and nothing supported
-- that ordering, so every thread fetch sorted. The existing
-- (boardId, blockId) index served the filter by prefix but not the sort.
CREATE INDEX IF NOT EXISTS "workspace_board_comments_boardId_createdAt_idx"
    ON "workspace_board_comments" ("boardId", "createdAt");
