import CollectionAppClient from "./CollectionAppClient";
export default function CollectionAppPage({ params }: { params: { boardId: string; blockId: string } }) {
  return <CollectionAppClient boardId={params.boardId} blockId={params.blockId} />;
}
