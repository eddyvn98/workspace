export interface ConnectorAuxiliaryPath {
  path: string;
  parentId: string;
}

export interface StyledConnectorAuxiliaryPath extends ConnectorAuxiliaryPath {
  color: string;
  opacity: number;
}
