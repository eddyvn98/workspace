import type { StyledConnectorAuxiliaryPath } from "./connectorAuxiliaryPathTypes";

export function ConnectorAuxiliaryPaths({ fishboneRibPaths, timelineAxisPaths }: { fishboneRibPaths: StyledConnectorAuxiliaryPath[]; timelineAxisPaths: StyledConnectorAuxiliaryPath[] }) {
  return (
    <>
      {fishboneRibPaths.map((entry, index) => <path key={`fishbone-rib-${entry.parentId}-${index}`} data-fishbone-rib="true" d={entry.path} fill="none" stroke={entry.color} strokeWidth={2} opacity={entry.opacity} pointerEvents="none" />)}
      {timelineAxisPaths.map((entry, index) => <path key={`timeline-axis-${entry.parentId}-${index}`} data-timeline-axis="true" d={entry.path} fill="none" stroke={entry.color} strokeWidth={2} opacity={entry.opacity} pointerEvents="none" />)}
    </>
  );
}
