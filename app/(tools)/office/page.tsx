import OfficeClient from "./OfficeClient";
export default function OfficePage() {
  const devBypass = process.env.NODE_ENV !== "production" && Boolean(process.env.WORKSPACE_DEV_USER_EMAIL);
  return <OfficeClient devBypass={devBypass} />;
}
