export const matrixDragTreshold = 4;

export interface IMatrix {
  items: IMatrixItem[];
}

export interface IMatrixRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IMatrixItem extends IMatrixRect {
  id: number;
  color?: string;
  selected?: boolean;
}

export interface IDrag {
  item: IMatrixItem;
  resultPixelRect: DOMRect;
  resultRect: IMatrixRect;
}
