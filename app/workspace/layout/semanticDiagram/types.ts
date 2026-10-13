import type { AnchorSide } from "../../types/connector";
import type { SemanticDiagramValidationResult } from "../semanticDiagramValidation";

export type SemanticDiagramDirection = "down" | "right";

export interface SemanticDiagramRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SemanticDiagramNode {
  key: string;
  w: number;
  h: number;
  /** Optional display label used only to identify the conventional start/end
   * nodes when the graph keys are opaque canvas UUIDs. */
  label?: string;
}

export interface SemanticDiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface SemanticDiagramRoute {
  fromSide: AnchorSide;
  toSide: AnchorSide;
  /** World-space bend points, excluding the endpoint anchors. */
  waypoints: { x: number; y: number }[];
}

export interface SemanticDiagramLayoutResult {
  positions: Map<string, SemanticDiagramRect>;
  ranks: Map<string, number>;
  routes: Map<number, SemanticDiagramRoute>;
  validation: SemanticDiagramValidationResult;
}
