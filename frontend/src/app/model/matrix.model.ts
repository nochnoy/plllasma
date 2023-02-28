export const matrixDragTreshold = 4;

export interface IMatrix {
  objects: IMatrixObject[];
}

export interface IMatrixRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IMatrixObject extends IMatrixRect {
  id: number;
  color?: string;
  selected?: boolean;
}

export interface IMatrixObjectTransform {
  object: IMatrixObject;
  resultPixelRect: DOMRect;
  resultRect: IMatrixRect;
}
