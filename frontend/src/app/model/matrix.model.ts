import {Const} from "./const";

export const matrixCellSize = 2 * Const.remInPixels;             // ! должна быть равна css-переменной --matrix-cell-size
export const matrixGap = Math.round(0.5 * Const.remInPixels); // ! должна быть равна css-переменной --matrix-gap
export const matrixColsCount = 25; // ! должна быть равна css-переменной --matrix-cols-count А ТАКЖЕ соответствовать css-гриду и .bg в matrix.component.css
export const matrixFlexCol = 24;   // ! должна быть равна css-переменной --matrix-flex-col А ТАКЖЕ соответствовать css-гриду и .bg в matrix.component.css
export const matrixDragThreshold = 4;

export interface IMatrix {
  newObjectId: number;
  objects: IMatrixObject[];
}

export interface IMatrixRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export enum MatrixObjectTypeEnum {
  text = 0,
  image = 1,
  door = 2,
  title = 3,
  channelTitle = 4,
}

export interface IMatrixObject extends IMatrixRect {
  id: number;
  color?: string;
  selected?: boolean;
  domRect?: DOMRect;
  type?: MatrixObjectTypeEnum
  image?: string;
  text?: string;
}

export interface IMatrixObjectTransform {
  object: IMatrixObject;
  resultMatrixRect: IMatrixRect;
  resultDomRect: DOMRect;
}

export function newMatrix(): IMatrix {
  return {
    newObjectId: 0,
    objects: []
  }
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
