-- Owner-controlled visibility of pre-invite edit history. Default false: a
-- collaborator sees only what changed after they were given access.
ALTER TABLE "mindmaps" ADD COLUMN "shareFullHistory" BOOLEAN NOT NULL DEFAULT false;
