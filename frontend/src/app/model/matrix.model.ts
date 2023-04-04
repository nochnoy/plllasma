import {Const} from "./const";

export const matrixCellSize = 2 * Const.remInPixels; // должна быть равна css-переменной --matrix-cell-size
export const matrixGap = Math.round(0.5 * Const.remInPixels); // должна быть равна css-переменной --matrix-gap
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

// Очищает чисто клиентские данные которые не должны сохраняться в БД
export function serializeMatrix(matrix: IMatrix): any {
  const output: any = JSON.parse(JSON.stringify(matrix)); // deep clone

  output.objects.forEach((o: any) => {
    delete o.domRect;
    delete o.selected;
  })

  return output;
}
