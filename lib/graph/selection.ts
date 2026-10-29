/**
 * What the map and the detail pane both point at. One type, owned by neither
 * component, so either side can drive the other.
 */
export type Selection =
  | { kind: "node"; id: string }
  | { kind: "file"; path: string }
  | null;
