import { NextRequest, NextResponse } from "next/server";
import { WORKSPACE_COMMAND_REGISTRY_VERSION } from "@/lib/workspace-command-registry";
import { prisma } from "@/lib/prisma";
import { resolveAccessRole } from "../../../_access";
import { resolveWorkspaceCallerAuth } from "../../../_auth";
import {
  describeWorkspaceCapabilities,
  WORKSPACE_CAPABILITY_CATEGORIES,
  isWorkspaceCapabilityCategory,
} from "@/lib/workspace-command-capabilities";

type JsonMap = Record<string, unknown>;

function map(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

/** POST /api/workspaces/[id]/agent/capabilities — return a filtered command catalog. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: JsonMap = {};
  try {
    body = map(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const auth = await resolveWorkspaceCallerAuth(req, body);
  if (!auth.ok) return NextResponse.json({ error: auth.message, code: auth.code }, { status: auth.status });

  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = await resolveAccessRole(board, auth.email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawCategories = Array.isArray(body.categories) ? body.categories : [];
  const invalidCategories = rawCategories.filter((category) => !isWorkspaceCapabilityCategory(category));
  if (invalidCategories.length > 0) {
    return NextResponse.json({
      error: "Unknown capability category",
      invalidCategories,
      availableCategories: WORKSPACE_CAPABILITY_CATEGORIES,
    }, { status: 400 });
  }

  const mainMode = typeof body.mainMode === "string" ? body.mainMode : undefined;
  const subMode = typeof body.subMode === "string" ? body.subMode : undefined;
  const capabilities = describeWorkspaceCapabilities(rawCategories, mainMode, subMode);
  return NextResponse.json({
    success: true,
    registryVersion: WORKSPACE_COMMAND_REGISTRY_VERSION,
    selectedCategories: capabilities.map((item) => item.category),
    capabilities,
  });
}
