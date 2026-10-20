import { notFound } from "next/navigation";
import SlideAcceptanceClient from "./SlideAcceptanceClient";

export const dynamic = "force-dynamic";

export default function SlideAcceptancePage() {
  if (process.env.SLIDE_BROWSER_ACCEPTANCE !== "true" && process.env.NODE_ENV === "production") notFound();
  return <SlideAcceptanceClient />;
}
