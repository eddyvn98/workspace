# Workspace

A collaborative canvas for documents, diagrams, tables, and AI-assisted image flows.

## Requirements

- Node.js 20 or newer
- pnpm 9
- MongoDB and PostgreSQL
- Dify API credentials for Workspace AI features

## Setup

1. Copy `.env.example` to `.env.local` and set the values for your environment.
2. Install dependencies with `pnpm install`.
3. Generate the database client with `pnpm prisma:generate`.
4. Start the app with `pnpm dev` and open `http://localhost:3000/workspace`.

Workspace uses a local-only development identity configured by `WORKSPACE_DEV_USER_EMAIL`; this identity provider is disabled in production. Boards and access are stored in PostgreSQL. Realtime state uses MongoDB. AI requests are sent to the configured Dify server.

## Configuration

See `.env.example` for the supported environment variables. No tenant, organization, or hosted Dify endpoint is hard-coded in this repository.

## Implementation blueprint

The complete production-readiness plan is documented separately from implemented behavior:

- [00 — Master plan: architecture, phases, dependencies and definition of done](docs/implementation/00-master-plan.md)
- [01 — Library capability matrix and integration audit](docs/implementation/01-library-capability-matrix.md)
- [02 — Implementation backlog with work item IDs and acceptance criteria](docs/implementation/02-implementation-backlog.md)
- [03 — Release/staging E2E, security, operations and rollback runbook](docs/implementation/03-release-acceptance.md)

**Documentation does not mark features as delivered.** Check the linked PRs, CI runs, authenticated staging tests and restore evidence before marking a milestone complete.
