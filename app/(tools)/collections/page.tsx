import CollectionsClient from "./CollectionsClient";
export default function CollectionsPage() { return <CollectionsClient devBypass={process.env.NODE_ENV !== "production" && Boolean(process.env.WORKSPACE_DEV_USER_EMAIL)} />; }
