import { SlideChartNodeView } from "../components/slides/SlideChartNodeView";
import { Node, ReactNodeViewRenderer } from "@tiptap/react";
import { parseSlideChart, slideChartSpec } from "../utils/slideChart";

export const SlideChart = Node.create({
  name: "slideChart",
  group: "block",
  atom: true,
  addAttributes() {
    return { series: { default: [], parseHTML: (element: HTMLElement) => parseSlideChart(element.getAttribute("data-series")), rendered: false } };
  },
  parseHTML() { return [{ tag: 'div[data-slide-chart="bar"]', getAttrs: (element) => parseSlideChart((element as HTMLElement).getAttribute("data-series")).length ? null : false }]; },
  addNodeView() { return ReactNodeViewRenderer(SlideChartNodeView); },
  renderHTML({ node }) { return slideChartSpec(parseSlideChart(node.attrs.series)); },
});
