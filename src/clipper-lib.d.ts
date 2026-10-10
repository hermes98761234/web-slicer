declare module 'clipper-lib' {
  export interface IntPoint {
    X: number
    Y: number
  }
  export type Path = IntPoint[]
  export type Paths = Path[]
  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number)
    AddPaths(paths: Paths, joinType: number, endType: number): void
    Execute(solution: Paths, delta: number): void
  }
  export class Clipper {
    constructor()
    AddPaths(paths: Paths, polyType: number, closed: boolean): boolean
    Execute(clipType: number, solution: Paths, subjFillType: number, clipFillType: number): boolean
  }
  export const JoinType: { jtSquare: number; jtRound: number; jtMiter: number }
  export const EndType: { etClosedPolygon: number }
  export const ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number }
  export const PolyType: { ptSubject: number; ptClip: number }
  export const PolyFillType: { pftEvenOdd: number; pftNonZero: number }
}
