import { notFound } from "next/navigation";
import CollectionAcceptanceClient from "./CollectionAcceptanceClient";

/** The opt-in must be checked at REQUEST time, not cached during build. */
export const dynamic = "force-dynamic";

/** Disabled in all deployments unless explicitly enabled for browser QA. */
export default function CollectionAcceptancePage() {
  if (process.env.COLLECTION_BROWSER_ACCEPTANCE !== "true") notFound();
  return <CollectionAcceptanceClient />;
}
