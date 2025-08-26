import {Const} from "./const";

export const matrixCellSize = 2 * Const.remInPixels;             // ! должна быть равна css-переменной --matrix-cell-size
export const matrixGap = Math.round(0.5 * Const.remInPixels);    // ! должна быть равна css-переменной --matrix-gap
export const matrixColsCount = 18;                                       // ! должна быть равна css-переменной --matrix-cols-count А ТАКЖЕ соответствовать css-гриду и .bg в matrix.component.css
export const matrixFlexCol = 17;                                         // ! должна быть равна css-переменной --matrix-flex-col А ТАКЖЕ соответствовать css-гриду и .bg в matrix.component.css
export const matrixAddCol = 10;                                          // На какой столбец добавляются блоки когда юзер их создаёт
export const matrixDragThreshold = 4;
export const matrixCollapsedHeightCells = 10;                            // ! должна быть равна css-переменной --matrix-collapsed-height-cells

export interface IMatrix {
  newObjectId: number;
  objects: IMatrixObject[];
  height: number;
  collapsed: boolean;
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
}

export interface IMatrixObject extends IMatrixRect {
  id: number;
  color?: string;
  selected?: boolean;
  domRect?: DOMRect;
  type?: MatrixObjectTypeEnum
  image?: string;
  text?: string;
  changed: string;
}

export interface IMatrixObjectTransform {
  object: IMatrixObject;
  resultMatrixRect: IMatrixRect;
  resultDomRect: DOMRect;
}

export function newMatrix(): IMatrix {
  return {
    newObjectId: 0,
    objects: [],
    height: 0,
    collapsed: false,
  }
}

export function newDefaultMatrix(channelName: string): IMatrix {
  const matrix = newMatrix();
  // Убираем создание заголовка канала из матрицы
  matrix.height = 0;
  return matrix;
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

// Перемещает объекты, выходящие за границы матрицы, на первую свободную строку
export function fixMatrixBoundaries(matrix: IMatrix): IMatrix {
  if (!matrix.objects || matrix.objects.length === 0) {
    return matrix;
  }

  const fixedMatrix = { ...matrix };
  const objectsToMove: IMatrixObject[] = [];
  const objectsInBounds: IMatrixObject[] = [];

  // Разделяем объекты на те, что в границах и те, что нужно переместить
  fixedMatrix.objects.forEach(obj => {
    // Вырезаем объекты неизвестного типа
    if (obj.type === undefined || obj.type < 0 || obj.type > 3) {
      console.log(`Вырезаем объект неизвестного типа: ${obj.type}, id: ${obj.id}`);
      return;
    }

    const isOutOfBounds = obj.x < 0 ||
                         obj.x + obj.w > matrixColsCount ||
                         obj.w > matrixColsCount;

    if (isOutOfBounds) {
      // Обрезаем ширину объекта если он слишком широкий
      const fixedObj = { ...obj };
      if (fixedObj.w > matrixColsCount) {
        fixedObj.w = matrixColsCount;
      }
      objectsToMove.push(fixedObj);
    } else {
      objectsInBounds.push(obj);
    }
  });

  // Если нет объектов для перемещения, возвращаем исходную матрицу
  if (objectsToMove.length === 0) {
    return matrix;
  }

  // Логируем информацию об исправлении
  console.log(`Исправляем матрицу: найдено ${objectsToMove.length} объектов, выходящих за границы (${matrixColsCount} столбцов)`);
  objectsToMove.forEach((obj, index) => {
    console.log(`  Объект ${index + 1}: x=${obj.x}, y=${obj.y}, w=${obj.w}, h=${obj.h} -> будет перемещен`);
  });

  // Находим Y-координату первой свободной строки
  let maxY = 0;
  objectsInBounds.forEach(obj => {
    maxY = Math.max(maxY, obj.y + obj.h);
  });

  // Перемещаем объекты на первую свободную строку, начиная с первого столбца
  objectsToMove.forEach((obj, index) => {
    const oldX = obj.x;
    const oldY = obj.y;
    obj.x = 0; // Первый столбец
    obj.y = maxY + index; // Каждый следующий объект на новой строке
    console.log(`  Объект ${index + 1}: перемещен с (${oldX},${oldY}) на (${obj.x},${obj.y})`);
  });

  // Объединяем объекты обратно
  fixedMatrix.objects = [...objectsInBounds, ...objectsToMove];

  // Обновляем высоту матрицы
  let newHeight = 0;
  fixedMatrix.objects.forEach(obj => {
    newHeight = Math.max(newHeight, obj.y + obj.h);
  });
  fixedMatrix.height = newHeight;

  console.log(`Матрица исправлена: новая высота = ${newHeight}`);

  return fixedMatrix;
}
