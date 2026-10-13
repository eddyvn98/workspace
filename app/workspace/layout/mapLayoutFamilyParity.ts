import type { MapLayoutFamily } from "../types/block";
import type { TreeLayoutFamily } from "./treeviewLayout";

/**
 * MapLayoutFamily (types/block.ts) and TreeLayoutFamily (treeviewLayout.ts)
 * describe the same set of layout families but are declared separately, so
 * the types module needs no layout-engine import. These two assignments fail
 * to compile the moment one list gains a family the other lacks — which is
 * exactly the drift that let a family exist in one place and be silently
 * unreachable in the other.
 */
const _mapToTree: TreeLayoutFamily = null as unknown as MapLayoutFamily;
const _treeToMap: MapLayoutFamily = null as unknown as TreeLayoutFamily;

void _mapToTree;
void _treeToMap;
