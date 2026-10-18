import { notFound } from "next/navigation";
import OfficeEditor from "./OfficeEditor";
import type { OfficeKind } from "@/lib/office/catalog";
const kinds = ["document", "spreadsheet", "presentation"];
export default function Page({ params }: { params: { kind: string } }) {
  if (!kinds.includes(params.kind)) notFound();
  return <OfficeEditor kind={params.kind as OfficeKind} devBypass={process.env.NODE_ENV !== "production" && Boolean(process.env.WORKSPACE_DEV_USER_EMAIL)} />;
}
