import CollectionAppClient from "./CollectionAppClient";
export default function CollectionAppPage({ params }: { params: { boardId: string; blockId: string } }) {
  return <CollectionAppClient boardId={params.boardId} blockId={params.blockId} devBypass={process.env.NODE_ENV !== "production" && Boolean(process.env.WORKSPACE_DEV_USER_EMAIL)} />;
}
