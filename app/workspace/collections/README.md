# Universal Collection Views

Adds a Collection block with Table, Kanban, Calendar, Timeline, Gallery and Mind Map views over one canonical record set.

## Usage
Insert > Add Collection to create the block. Edit records, switch tabs and use Settings for field and view configuration. Expand opens a full-screen editing mode. Backup JSON, Export CSV and Import CSV/JSON are supported.
To convert an existing table, select it and press To Collection on its toolbar; the original table remains unchanged.

## Code
- collections/model.ts: immutable record, field, view, filter, sort and parent operations
- collections/io.ts: Table->Collection, CSV/JSON import and export
- renderers/CollectionSurface.tsx: six view interfaces
- renderers/CollectionBlock.tsx: canvas integration
- __tests__/workspace/collection-views.test.ts: pure-model and import/export tests

## Limitations and release gate
Collections persist in Workspace board snapshots and follow the board permission model. Concurrent edits to separate records in one collection currently share one whole-block Yjs CRDT value: last writer can overwrite the other. Introduce per-record persistence/CRDT before high-concurrency deployment.
Collection Mind Map is a hierarchical outline, not the freeform diagram engine.
Current imports are bounded to 5,000 records; larger collections need a paginated backend.
Run pnpm install, pnpm prisma:generate, pnpm test:workspace and pnpm build before merging; perform manual UI regression tests with editable and read-only boards.