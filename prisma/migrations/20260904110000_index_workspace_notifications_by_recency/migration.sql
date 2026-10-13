-- The bell's only query is: this recipient, newest first, 50 of them. It never
-- filters on `read`, so (recipientEmail, read) is the wrong shape for it — the
-- sort had nothing to lean on and every 20s poll re-sorted the recipient's
-- whole history.
--
-- Note this is deliberately NOT a copy of legacy's
-- (mindmapId, read, createdAt): legacy puts `read` in the middle because its
-- query filters on it. Copying the shape rather than following v2's actual
-- query would leave `read` sitting between the filter and the sort, where it
-- blocks exactly the ordering this index exists to serve.
--
-- Safe only because 20260904100000 lower-cased the stored recipients and
-- constrained them: the route can now compare with a plain `=`, and a b-tree
-- on a case-sensitive column is usable again.
DROP INDEX IF EXISTS "workspace_notifications_recipientEmail_read_idx";

CREATE INDEX IF NOT EXISTS "workspace_notifications_recipientEmail_createdAt_idx"
    ON "workspace_notifications" ("recipientEmail", "createdAt" DESC);
