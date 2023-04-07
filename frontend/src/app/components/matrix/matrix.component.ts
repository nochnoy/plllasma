import {
  Component,
  ElementRef, EventEmitter,
  HostListener,
  Input, OnDestroy,
  OnInit, Output,
} from '@angular/core';
import {
  IMatrixObjectTransform,
  IMatrix,
  IMatrixObject,
  matrixDragTreshold,
  IMatrixRect, matrixColsCount, matrixCellSize, matrixGap, matrixFlexibleCol
} from "../../model/matrix.model";
import {Channel} from "../../model/messages/channel.model";

@Component({
  selector: 'app-matrix',
  templateUrl: './matrix.component.html',
  styleUrls: ['./matrix.component.scss']
})
export class MatrixComponent implements OnInit, OnDestroy {

  constructor(
    private elementRef: ElementRef,
  ) { }

  @Output('changed')
  changed = new EventEmitter<IMatrix>();

  matrix = {} as IMatrix;
  matrixHeight = 1;
  matrixRect: DOMRect = new DOMRect(0,0,0,0);
  cellSize: number = matrixCellSize;
  gap = matrixGap;
  cellSizePlusGap: number = matrixCellSize + matrixGap;
  thirteenthWidth: number = 0; // ширина 13го столбца
  thirteenthWidthPlusGap: number = 0; // ширина 13го столбца с гапом

  mouseX = 0;
  mouseY = 0;
  mouseDownPoint?: DOMPoint; // точка где была зажата мышка
  mouseDownObject?: IMatrixObject; // блок на котором была зажата мышка
  isMouseDownAndMoving = false; // мы зажали мышь и тащим её?
  isMouseDown = false; // мы зажали мышь и тащим её?
  isDragging = false;

  selectedObject?: IMatrixObject;
  softSelectedObject?: IMatrixObject;
  selectionRectValue?: DOMRect;
  shadowRect?: DOMRect; // x/y/w/h серого квадрата под таскаемым объектом

  transform?: IMatrixObjectTransform; // происходящее изменение размеров/позиции одного из объектов

  matrixRectUpdateInterval: any;

  @Input('channel')
  set channel(channel: Channel) {
    if (channel.matrix) {
      this.matrix = channel.matrix;
      this.matrix.objects.forEach((o) => o.domRect = this.matrixRectToDomRect(o));
      this.updateMatrixHeight();
    }
  };

  get selectionRect(): DOMRect | undefined {
    return this.selectionRectValue;
  }
  set selectionRect(value: DOMRect | undefined) {
    this.selectionRectValue = value;
    this.onResize();
  }

  ngOnInit(): void {
    this.updateMatrixRect();
    this.matrixRectUpdateInterval = setInterval(() => this.updateMatrixRect(), 1000);
  }

  ngOnDestroy() {
    clearInterval(this.matrixRectUpdateInterval);
  }

  // Слушаем мышь /////////////////////////////////////////////////////////////

  @HostListener('document:mousedown', ['$event'])
  onMouseDown(event: PointerEvent) {
    this.updateMouseXY(event);
    this.isMouseDown = true;
    this.isMouseDownAndMoving = false;
    this.mouseDownPoint = new DOMPoint(event.clientX, event.clientY);

    const block: any = event?.target;
    const id = parseInt(block.id);
    this.mouseDownObject = this.matrix?.objects.find((object) => object.id === id) ?? undefined;
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: PointerEvent) {
    this.updateMouseXY(event);
    this.isMouseDown = false;
    let needToDeselect = false;
    if (this.mouseDownPoint) {
      if (!this.isMouseDownAndMoving) {
        if (this.isMouseInsideRect()) {
          // мышь не двигалась, mouseup там-же где и mousedown - значит это был клик
          this.onClickObject();
          if (!this.mouseDownObject) {
            needToDeselect = true;
          }
        } else {
          needToDeselect = true;
        }
      }

      // Что бы это ни было, оно закончилось. Знаканчиваем следить.
      if (this.isDragging) {
        this.endDrag();
      }
      if (needToDeselect) {
        // должно стоять после endDrag и прочих кто завасит от селекта
        this.deselect();
      }
      delete this.mouseDownPoint;
      this.isMouseDownAndMoving = false;
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: PointerEvent) {
    this.updateMouseXY(event);

    // Странная залипуха, защищающая от ситуации когда выделен объект, на нём лежит рамка выделения
    // и ты пытаешься его тащить но фактически схватил рамку, т.е. ничего не схватил.
    // Наверняка этот костыль привёт к проблемам. Посмотрим.
    if (!this.mouseDownObject && this.selectedObject && this.isXYInsideObject(this.mouseX, this.mouseY, this.selectedObject)) {
      this.mouseDownObject = this.selectedObject;
    }

    if (this.mouseDownPoint && this.mouseDownObject) {
      // Мы тащим выделенный объект.
      if (this.isMouseDownAndMoving) {
        this.onDrag();
      } else {
        if (Math.abs(event.clientX - this.mouseDownPoint.x) > matrixDragTreshold || Math.abs(event.clientY - this.mouseDownPoint.y) > matrixDragTreshold) {

          // Выделяем то что тащим
          if (this.mouseDownObject !== this.selectedObject) {
            this.select(this.mouseDownObject);
          }

          this.isMouseDownAndMoving = true;
          this.startDrag();
        }
      }
    } else {
      setTimeout(() => { // Пропустим кадр чтобы успел засеттится isMouseDown
        if (!this.selectedObject && !this.isMouseDown/* защита от деселекта при ресайзе */ ) {
          // Мы ничего не тащим и нет выделенных объектов. Тогда попробуем софт-селектнуть объект над которым мышь.
          const block: any = event?.target;
          if (block?.parentNode?.nodeName !== 'APP-SELECTION') { // Проверка что мы не навелись на рамку выделения
            let needCancelSoftSelect = false;
            if (block.classList.contains('item')) {
              // Это объект в матрице. Попытаемся его софтвыделить
              const id = parseInt(block.id);
              this.softSelectedObject = this.matrix?.objects.find((object) => object.id === id) ?? undefined;
              if (this.softSelectedObject) {
                this.selectionRect = this.matrixRectToDomRect(this.softSelectedObject);
                needCancelSoftSelect = !this.selectionRect;
              }
            } else {
              needCancelSoftSelect = true;
            }
            if (needCancelSoftSelect) {
              // Это хрен знает что. Считаем что юзер убрал мышку с объектов. Отменяем софтвыделение.
              this.softSelectedObject = undefined;
              this.selectionRect = undefined;
            }
          }
        }
      });
    }
  }

  // Мышь и границы ///////////////////////////////////////////////////////////

  updateMouseXY(event: PointerEvent | MouseEvent): void {
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;
  }

  updateMatrixRect(): void {
    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    const mr = this.matrixRect;
    if (!this.cellSize || rect.x !== mr.x || rect.y !== mr.y || rect.width !== mr.width || rect.height !== mr.height) {
      this.matrixRect = rect;
      this.thirteenthWidth = Math.max(this.cellSize, rect.width - ((matrixColsCount - 1) * this.cellSizePlusGap) - this.gap);
      this.thirteenthWidthPlusGap = this.thirteenthWidth + matrixGap;
      this.updateSelectionRect();
      if (this.matrix.objects) {
        this.matrix.objects.forEach((o) => o.domRect = this.matrixRectToDomRect(o));
      }
    }
  }

  isMouseInsideRect(): boolean {
    if (this.mouseX >= this.matrixRect.x && this.mouseX <= this.matrixRect.x + this.matrixRect.width) {
      if (this.mouseY >= this.matrixRect.y && this.mouseY <= this.matrixRect.y + this.matrixRect.height) {
        return true;
      }
    }
    return false;
  }

  isXYInsideObject(x: number, y: number, object: IMatrixObject): boolean {
    const cellX = Math.round((x - this.matrixRect.x) / this.cellSizePlusGap);
    const cellY = Math.round((y - this.matrixRect.y) / this.cellSizePlusGap);
    return (cellX >= object.x && cellX <= object.x + object.w) && (cellY>= object.y && cellY <= object.y + object.h);
  }

  // Выделение объектов ///////////////////////////////////////////////////////

  select(object: IMatrixObject): void {
    if (object !== this.selectedObject) {
      if (this.selectedObject) {
        this.deselect();
      }

      this.selectedObject = object;
      this.selectedObject.selected = true;
      this.updateSelectionRect();

      // Выделенный всегда всплывает наверх
      this.matrix!.objects = this.matrix?.objects.filter((i) => i !== object);
      this.matrix!.objects.push(this.selectedObject);
    }
  }

  updateSelectionRect(): void {
    if (this.selectedObject) {
      if (!this.transform) {
        this.selectionRect = this.matrixRectToDomRect(this.selectedObject);
      } else {
        this.selectionRect = undefined;
      }
    } else {
      this.selectionRect = undefined;
    }
  }

  deselect(): void {
    if (this.selectedObject) {
      this.selectedObject.selected = false;
    }
    delete this.selectedObject;
    this.selectionRect = undefined;
  }

  // Ресайз объекта при помощи рамки выделения ////////////////////////////////

  startResize(): void {
    this.isDragging = true;
    if (!this.selectedObject && this.softSelectedObject) {
      // Объект был софт-выделен а юзер стал его ресайзить. Выделяем объект по-настоящему.
      this.select(this.softSelectedObject);
      delete this.softSelectedObject;
    }
    this.createTransform();
  }

  onResize(): void {
    if (this.selectionRectValue && this.transform) {
      this.transform.resultDomRect = new DOMRect(
        this.selectionRectValue.x - this.matrixRect.x,
        this.selectionRectValue.y - this.matrixRect.y,
        this.selectionRectValue.width,
        this.selectionRectValue.height
      );
      this.transform.resultMatrixRect = this.domRectToMatrixRect(this.transform.resultDomRect);
      this.shadowRect = this.matrixRectToDomRect(this.keepInBoundaries(this.transform.resultMatrixRect));
    }
  }

  endResize(): void {
    this.isDragging = false;
    if (this.transform) {
      this.transform.object.x = this.transform.resultMatrixRect.x;
      this.transform.object.y = this.transform.resultMatrixRect.y;
      this.transform.object.w = this.transform.resultMatrixRect.w;
      this.transform.object.h = this.transform.resultMatrixRect.h;
      this.transform.object.domRect = this.matrixRectToDomRect(this.transform.object);
      this.destroyTransform();
      this.updateSelectionRect();
      this.updateMatrixHeight();
      this.changed.emit(this.matrix);
    }
    this.deselect();
  }

  // Драг объекта /////////////////////////////////////////////////////////////

  startDrag(): void {
    this.isDragging = true;
    if (!this.transform) {
      if (this.selectedObject) {
        this.createTransform();
        this.updateSelectionRect();
      }
    }
  }

  onDrag(): void {
    if (this.transform && this.mouseDownPoint) {
      const shiftX = this.mouseX - this.mouseDownPoint.x;
      const shiftY = this.mouseY - this.mouseDownPoint.y;
      this.transform.resultDomRect = new DOMRect(
        (this.transform.object.x  * this.cellSizePlusGap) + shiftX,
        (this.transform.object.y  * this.cellSizePlusGap) + shiftY,
        this.transform.object.w * this.cellSizePlusGap - this.gap,
        this.transform.object.h * this.cellSizePlusGap - this.gap,
      );
      this.transform.resultMatrixRect = this.domRectToMatrixRect(this.transform.resultDomRect);
      this.shadowRect = this.matrixRectToDomRect(this.keepInBoundaries(this.transform.resultMatrixRect));
    }
  }

  endDrag(): void {
    this.isDragging = false;
    if (this.transform) {
      this.transform.object.x = this.transform.resultMatrixRect.x;
      this.transform.object.y = this.transform.resultMatrixRect.y;
      this.transform.object.w = this.transform.resultMatrixRect.w;
      this.transform.object.h = this.transform.resultMatrixRect.h;
      this.transform.object.domRect = this.matrixRectToDomRect(this.transform.object);
      this.destroyTransform();
      this.updateSelectionRect();
      this.updateMatrixHeight();
      this.changed.emit(this.matrix);
    }
    this.deselect();
  }

  // Клик по объекту //////////////////////////////////////////////////////////

  onClickObject(): void {
    if (this.mouseDownObject) {
      this.select(this.mouseDownObject);
    }
    return undefined;
  }

  // Прочая хрень /////////////////////////////////////////////////////////////

  updateMatrixHeight(): void {
    let h = 1;
    this.matrix.objects.forEach((o) => {
      h = Math.max(h, o.y + o.h);
    });
    this.matrixHeight = h;
  }

  matrixRectToDomRect(rect: IMatrixRect): DOMRect {
    let   x = this.matrixRect.x + rect.x * this.cellSizePlusGap;
    let   w = rect.w * this.cellSizePlusGap - this.gap;
    const y = this.matrixRect.y + rect.y * this.cellSizePlusGap;
    const h = rect.h * this.cellSizePlusGap - this.gap;

    // Учтём влияние тянущегося столбца
    if (rect.x > matrixFlexibleCol) {
      x += this.thirteenthWidth;
      x -= this.cellSize; // отнимем ширину самого 13го
      if (this.thirteenthWidth > this.cellSize) {
        // Не знаю что это за эффект. Растянутый 13й перестаёт совпадать на 1 гап. Пока не пойму что это - костыль.
        x += this.gap;
      }
    }
    if (rect.x <= matrixFlexibleCol && rect.x + rect.w > matrixFlexibleCol) {
      w += this.thirteenthWidth;
      w -= this.cellSize; // отнимем ширину самого 13го
      if (this.thirteenthWidth > this.cellSize) {
        // Не знаю что это за эффект. Растянутый 13й перестаёт совпадать на 1 гап. Пока не пойму что это - костыль.
        w += this.gap;
      }
    }

    return new DOMRect(x, y, w, h);
  }

  domRectToMatrixRect(domRect: DOMRect): IMatrixRect {
    const result = {
      x: Math.round(domRect.left    / this.cellSizePlusGap),
      y: Math.round(domRect.top     / this.cellSizePlusGap),
      w: Math.round(domRect.width   / this.cellSizePlusGap),
      h: Math.round(domRect.height  / this.cellSizePlusGap),
    };

    result.w = Math.max(1, result.w);
    result.h = Math.max(1, result.h);

    return result;
  }

  // Если rect оказался за пределами матрицы - поправит его
  keepInBoundaries(rect: IMatrixRect): IMatrixRect {
    if (rect.w > matrixColsCount) {
      rect.w = matrixColsCount;
    }
    if (rect.x < 0) {
      rect.x = 0;
    }
    if (rect.x + rect.w > matrixColsCount - 1) {
      rect.x = matrixColsCount - rect.w;
    }
    if (rect.y < 0) {
      rect.y = 0;
    }
    return rect;
  }

  createTransform(): void {
    if (this.selectedObject) {
      this.transform = {
        object: this.selectedObject,
        resultDomRect: new DOMRect(),
        resultMatrixRect: {
          x: 0,
          y: 0,
          w: 0,
          h: 0
        }
      };
    }
  }

  destroyTransform(): void {
    this.transform = undefined;
  }
}
