-- Saved camera bookmarks (CameraFrame[]) for the "Presentation" panel/mode —
-- see app/workspace/types/camera.ts. Nullable, no backfill needed.

ALTER TABLE "workspace_boards" ADD COLUMN IF NOT EXISTS "frames" JSONB;
