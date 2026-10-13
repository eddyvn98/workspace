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
