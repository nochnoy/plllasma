export const matrixDragTreshold = 4;
export const matrixColsCount = 12;

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
  domRect?: DOMRect;
}

export interface IMatrixObjectTransform {
  object: IMatrixObject;
  resultMatrixRect: IMatrixRect;
  resultDomRect: DOMRect;
}
