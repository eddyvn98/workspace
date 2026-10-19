import { SlideChartNodeView } from "../components/slides/SlideChartNodeView";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { SlideChartSchema } from "./docEmbedSchema";

export const SlideChart = SlideChartSchema.extend({
  addNodeView() { return ReactNodeViewRenderer(SlideChartNodeView); },
});
