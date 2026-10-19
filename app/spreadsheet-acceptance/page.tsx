import { notFound } from "next/navigation";
import SpreadsheetAcceptanceClient from "./SpreadsheetAcceptanceClient";
export const dynamic = "force-dynamic";
/** Isolated local-persistence fixture, NOT a production auth bypass. */
export default function Page() {
  if (process.env.SPREADSHEET_BROWSER_ACCEPTANCE !== "true") notFound();
  return <SpreadsheetAcceptanceClient />;
}
