-- Keep the detached-map root marker in the relational tree as well as Y.Doc.
-- Nullable preserves legacy rows that predate detached-map roots.
ALTER TABLE "mindmap_nodes" ADD COLUMN "floatingMapRoot" BOOLEAN;
