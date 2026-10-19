import { Node, mergeAttributes } from "@tiptap/core";
import { parseSlideChart, slideChartSpec } from "../utils/slideChart";

/** Schema only: browser node views and the realtime service share these atoms. */
export const DocWorkspaceTableSchema = Node.create({
  name: "workspaceTable", group: "block", atom: true, selectable: true, isolating: true,
  addAttributes() {
    return { tableId: {
      default: null,
      parseHTML: (element) => element.getAttribute("data-table-id"),
      renderHTML: (attrs) => ({ "data-table-id": attrs.tableId }),
    } };
  },
  parseHTML() { return [{ tag: "div[data-workspace-table]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-workspace-table": "true" })];
  },
});

export const SlideChartSchema = Node.create({
  name: "slideChart", group: "block", atom: true,
  addAttributes() {
    return { series: { default: [], parseHTML: (element) => parseSlideChart(element.getAttribute("data-series")), rendered: false } };
  },
  parseHTML() {
    return [{ tag: 'div[data-slide-chart="bar"]', getAttrs: (element) => parseSlideChart(element.getAttribute("data-series")).length ? null : false }];
  },
  renderHTML({ node }) { return slideChartSpec(parseSlideChart(node.attrs.series)); },
});
