import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
} from '@angular/core';
import {HttpService} from "../../services/http.service";
import {tap} from "rxjs/operators";
import {
  IMatrixObjectTransform,
  IMatrix,
  IMatrixObject,
  matrixDragTreshold,
  IMatrixRect, matrixColsCount
} from "../../model/matrix.model";

@Component({
  selector: 'app-matrix',
  templateUrl: './matrix.component.html',
  styleUrls: ['./matrix.component.scss']
})
export class MatrixComponent implements OnInit, OnDestroy {

  constructor(
    public httpService: HttpService,
    private elementRef: ElementRef,
  ) { }

  matrix = {} as IMatrix;
  matrixRect: DOMRect = new DOMRect(0,0,0,0);
  matrixRectUpdateInterval: any;
  cellSize: number = 0;
  cellSizePlusGap: number = 0;
  isEditMode = true; // Когда юзер редактирует матрицу

  gap = 0;

  mouseX = 0;
  mouseY = 0;
  mouseDownPoint?: DOMPoint; // точка где была зажата мышка
  mouseDownObject?: IMatrixObject; // блок на котором была зажата мышка
  isMouseDownAndMoving = false; // мы зажали мышь и тащим её?

  selectedObject?: IMatrixObject;
  selectionRectValue?: DOMRect;
  shadowRect?: DOMRect; // xywh серого квадрата под таскаемым объектом

  transform?: IMatrixObjectTransform; // происходящее изменение размеров/позиции одного из объектов

  get selectionRect(): DOMRect | undefined {
    return this.selectionRectValue;
  }
  set selectionRect(value: DOMRect | undefined) {
    this.selectionRectValue = value;
    this.onResize();
  }

  ngOnInit(): void {
    this.gap = Math.round(parseFloat(getComputedStyle(document.documentElement).fontSize) / 2); // gap = 0.5rem
    this.httpService.matrixRead$().pipe(
      tap((result) => {
        if (result) {
          this.matrix = result;
          this.matrix.objects.forEach((o) => o.domRect = this.matrixRectToDomRect(o));
        }
      }),
    ).subscribe();

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
    this.isMouseDownAndMoving = false;
    this.mouseDownPoint = new DOMPoint(event.clientX, event.clientY);

    const block: any = event?.target;
    const id = parseInt(block.id);
    this.mouseDownObject = this.matrix?.objects.find((object) => object.id === id) ?? undefined;
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: PointerEvent) {
    this.updateMouseXY(event);

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
      this.endDrag();
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
      this.cellSize = (this.matrixRect.width / matrixColsCount) - this.gap + (this.gap / matrixColsCount);
      this.cellSizePlusGap = this.cellSize + this.gap;
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
      this.shadowRect = this.matrixRectToDomRect(this.transform.resultMatrixRect);
    }
  }

  endResize(): void {
    if (this.transform) {
      this.transform.object.x = this.transform.resultMatrixRect.x;
      this.transform.object.y = this.transform.resultMatrixRect.y;
      this.transform.object.w = this.transform.resultMatrixRect.w;
      this.transform.object.h = this.transform.resultMatrixRect.h;
      this.transform.object.domRect = this.matrixRectToDomRect(this.transform.object);
      this.destroyTransform();
      this.updateSelectionRect();
    }
  }

  // Драг объекта /////////////////////////////////////////////////////////////

  startDrag(): void {
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
      this.shadowRect = this.matrixRectToDomRect(this.transform.resultMatrixRect);
    }
  }

  endDrag(): void {
    if (this.transform) {
      this.transform.object.x = this.transform.resultMatrixRect.x;
      this.transform.object.y = this.transform.resultMatrixRect.y;
      this.transform.object.w = this.transform.resultMatrixRect.w;
      this.transform.object.h = this.transform.resultMatrixRect.h;
      this.transform.object.domRect = this.matrixRectToDomRect(this.transform.object);
      this.destroyTransform();
      this.updateSelectionRect();
    }
  }

  // Клик по объекту //////////////////////////////////////////////////////////

  onClickObject(): void {
    if (this.mouseDownObject) {
      this.select(this.mouseDownObject);
    }
    return undefined;
  }

  // Прочая хрень /////////////////////////////////////////////////////////////

  matrixRectToDomRect(rect: IMatrixRect): DOMRect {
    return new DOMRect(
      this.matrixRect.x + rect.x * this.cellSizePlusGap,
      this.matrixRect.y + rect.y * this.cellSizePlusGap,
      rect.w * this.cellSizePlusGap - this.gap,
      rect.h * this.cellSizePlusGap - this.gap
    );
  }

  domRectToMatrixRect(domRect: DOMRect): IMatrixRect {
    return {
      x: Math.round(domRect.left    / this.cellSizePlusGap),
      y: Math.round(domRect.top     / this.cellSizePlusGap),
      w: Math.round(domRect.width   / this.cellSizePlusGap),
      h: Math.round(domRect.height  / this.cellSizePlusGap),
    };
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