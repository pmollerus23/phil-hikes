import type { Point } from './model';

/** Imperative map controls. Import type-only so the archive shell never pulls in the map engine. */
export interface MapHandle {
  showPoint: (point: Point | null) => void;
  focusPoint: (point: Point) => void;
  frame: () => void;
}
