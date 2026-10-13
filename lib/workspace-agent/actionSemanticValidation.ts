import { validateCollectionAction } from "./collectionActionValidation";
import { validateDiagramAction } from "./diagramActionValidation";
import { validateFrameAction } from "./frameActionValidation";
import { validateShapeViewContainerAction } from "./shapeViewContainerActionValidation";
import { validateSlideAction } from "./slideActionValidation";
import { validateDocTableAction } from "./docTableActionValidation";
import { validateBlockMapAction } from "./blockMapActionValidation";
import { validateImageAction } from "./imageActionValidation";
import { validateSpatialAction } from "./spatialActionValidation";
import { validateTableStructureAction } from "./tableStructureActionValidation";
import { validateTableSurfaceAction } from "./tableSurfaceActionValidation";
import { validateTableWorkbookAction } from "./tableWorkbookActionValidation";

export function validateWorkspaceActionSemantics(action: Record<string, unknown>): string | null {
  return validateCollectionAction(action)
    ?? validateDiagramAction(action)
    ?? validateFrameAction(action)
    ?? validateShapeViewContainerAction(action)
    ?? validateSlideAction(action)
    ?? validateDocTableAction(action)
    ?? validateBlockMapAction(action)
    ?? validateImageAction(action)
    ?? validateSpatialAction(action)
    ?? validateTableWorkbookAction(action)
    ?? validateTableStructureAction(action)
    ?? validateTableSurfaceAction(action);
}
