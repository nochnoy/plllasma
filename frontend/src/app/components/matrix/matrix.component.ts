import {Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output,} from '@angular/core';
import {
  IMatrix,
  IMatrixObject,
  IMatrixObjectTransform,
  IMatrixRect,
  matrixCellSize,
  matrixColsCount,
  matrixDragTreshold,
  matrixFlexCol,
  matrixGap,
  MatrixObjectTypeEnum
} from "../../model/matrix.model";
import {Channel} from "../../model/messages/channel.model";
import {IUploadingAttachment} from "../../model/app-model";
import {Utils} from "../../utils/utils";
import {Const} from "../../model/const";

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
  flexColWidth: number = 0; // ширина 13го столбца
  flexColWidthPlusGap: number = 0; // ширина 13го столбца с гапом

  mouseX = 0;
  mouseY = 0;
  scrollX = 0;
  scrollY = 0;

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

  attachments: IUploadingAttachment[] = [];

  @Input('channel')
  set channel(channel: Channel | null) {
    this.channelValue = channel;
    if (channel?.matrix) {
      this.matrix = channel.matrix;
      this.matrix.objects.forEach((o) => o.domRect = this.matrixRectToDomRect(o));
      this.updateMatrixHeight();
    }
  };
  get channel(): Channel | null {
    return this.channelValue;
  }
  channelValue: Channel | null = null;

  get selectionRect(): DOMRect | undefined {
    return this.selectionRectValue;
  }
  set selectionRect(value: DOMRect | undefined) {
    this.selectionRectValue = value;
    this.onResize();
  }

  ngOnInit(): void {
    this.updateMatrixRect();
    this.matrixRectUpdateInterval = setInterval(() => this.updateMatrixRect(), 100);
  }

  ngOnDestroy() {
    clearInterval(this.matrixRectUpdateInterval);
  }

  // Слушаем Скролл /////////////////////////////////////////////////////////////

  @HostListener('document:scroll')
  onScroll() {
    this.scrollX = window.scrollX;
    this.scrollY = window.scrollY;
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
      this.flexColWidth = Math.max(this.cellSize, rect.width - ((matrixColsCount - 1) * this.cellSizePlusGap) - this.gap);
      this.flexColWidthPlusGap = this.flexColWidth + matrixGap;
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
        this.raskukojTransform();
        this.updateSelectionRect();
      }
    }
  }

  onDrag(): void {
    if (this.transform && this.mouseDownPoint) {
      const shiftX = this.mouseX - this.mouseDownPoint.x;
      const shiftY = this.mouseY - this.mouseDownPoint.y;

      let flexColShift = 0;
      if (this.transform.object.x > matrixFlexCol) {
        // Учтём ширину резинового столбца
        flexColShift = this.flexColWidthPlusGap - this.cellSize;
      }

      this.transform.resultDomRect = new DOMRect(
        (this.transform.object.x   * this.cellSizePlusGap) + flexColShift + shiftX,
        (this.transform.object.y   * this.cellSizePlusGap) + shiftY,
        this.transform.object.w * this.cellSizePlusGap - this.gap,
        this.transform.object.h * this.cellSizePlusGap - this.gap,
      );

      this.transform.resultMatrixRect =  this.domRectToMatrixRect(this.transform.resultDomRect);
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
      if (this.mouseDownObject === this.selectedObject) { // Был выделен объект и мы ткнули в него ещё раз
        this.onDoubleClickObject();
      } else {
        this.select(this.mouseDownObject);
      }
    }
    return undefined;
  }

  onDoubleClickObject(): void {
    if (this.selectedObject) {
      switch (this.selectedObject.type) {

        case MatrixObjectTypeEnum.image:
          window.open('/matrix' + '/' + this.channel?.id + '/' + this.selectedObject.image, '_blank');
          break;

      }
    }
  }

  // 13й гибкий столбец ///////////////////////////////////////////////////////

  skukojWidth(domRect: DOMRect, x: number, w: number): number {
    // Определяем ширину куска оказавшегося над 13м столбцом, сокращаем её до 1
    // и соответственно меняем ширину объекта чтобы он не выглядел увеличенным
    if (x <= matrixFlexCol && matrixFlexCol <= x + w - 1) {
      const xVisual = Math.round(domRect.left / this.cellSizePlusGap); // x если бы все столбцы были одинаковые
      const xShift = xVisual - x; // на сколько смещён x внутри 13го стоблца
      const flexColCapacity = Math.floor(this.flexColWidthPlusGap / this.cellSizePlusGap); // ширина 13го в клетках
      const leftSide = Math.max(0, w - Math.max(0, x + w - matrixFlexCol)) // часть блока слева от 13го столбца
      const inAndRightSide = Math.max(0, w - leftSide); // внутренняя плюс правая часть
      const shrinkSize = flexColCapacity - xShift;
      const inAndRightSideShrinked = Math.max(1, inAndRightSide - shrinkSize);
      w = leftSide + inAndRightSideShrinked;
    }
    return w;
  }

  // Дёргается когда юзер начинает тащить/ресайзить блок
  // Проверяет, не был ли блок на резиновом столбце и если да
  // то увеличивает ширину объекта на визуальную ширину 13го столбца
  raskukojTransform(): void {
    const transform = this.transform!!;
    const x = transform.object.x;
    const w = transform.object.w;
    if (x <= matrixFlexCol && matrixFlexCol <= x + w - 1) {
      // Блок находился на 13м столбце, значит увеличим его ширину на ширину столбца
      const flexColCapacity = Math.round(this.flexColWidthPlusGap / this.cellSizePlusGap); // ширина 13го в клетках
      const rakukojedWidth = w - 1 + flexColCapacity;
      transform.resultMatrixRect.w = rakukojedWidth;
      transform.object.w = rakukojedWidth;
      transform.resultDomRect.width = rakukojedWidth * this.cellSizePlusGap;
    }
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
    let x = this.matrixRect.x + rect.x * this.cellSizePlusGap;
    let w = rect.w * this.cellSizePlusGap - this.gap;
    let y = this.matrixRect.y + rect.y * this.cellSizePlusGap;
    let h = rect.h * this.cellSizePlusGap - this.gap;

    // Учтём влияние тянущегося столбца
    if (rect.x > matrixFlexCol) {
      x += this.flexColWidth;
      x -= this.cellSize; // отнимем ширину самого 13го
      if (this.flexColWidth > this.cellSize) {
        // Не знаю что это за эффект. Растянутый 13й перестаёт совпадать на 1 гап. Пока не пойму что это - костыль.
        x += this.gap;
      }
    }
    if (rect.x <= matrixFlexCol && rect.x + rect.w > matrixFlexCol) {
      w += this.flexColWidth;
      w -= this.cellSize; // отнимем ширину самого 13го
      if (this.flexColWidth > this.cellSize) {
        // Не знаю что это за эффект. Растянутый 13й перестаёт совпадать на 1 гап. Пока не пойму что это - костыль.
        w += this.gap;
      }
    }

    x += this.scrollX;
    y += this.scrollY;

    return new DOMRect(x, y, w, h);
  }

  domRectToMatrixRect(domRect: DOMRect): IMatrixRect {
    let x = -1;
    let y = Math.round(domRect.top     / this.cellSizePlusGap);
    let w = Math.round(domRect.width   / this.cellSizePlusGap);
    let h = Math.round(domRect.height  / this.cellSizePlusGap);

    // Учитываем смещение 13го столбца и столбцов за ним
    const w13start = matrixFlexCol * this.cellSizePlusGap;
    const w13end = w13start + this.flexColWidthPlusGap;
    if (domRect.left < w13start) {
      x = Math.round(domRect.left    / this.cellSizePlusGap);
    } else if (domRect.left <= w13end) {
      x = matrixFlexCol;
    } else if (domRect.left > w13end) {
      x = matrixFlexCol + 1 + Math.round((domRect.left - w13end) / this.cellSizePlusGap);
    }

    w = this.skukojWidth(domRect, x, w);

    // Соблюдаем границы
    w = Math.max(1, w);
    h = Math.max(1, h);

    return {x, y, w, h};
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

  addAttachments(files: File[]) {
    const newAttachments: IUploadingAttachment[] = files.map((file) => {
      return {
        file: file,
        isImage: file?.type?.split('/')[0] === 'image',
        isReady: false
      } as IUploadingAttachment;
    });
    const checkAttachmentsReady = () => {
      if (!newAttachments.some((attachment) => !attachment || !attachment.isReady)) {
        this.attachments = [...this.attachments, ...newAttachments];
      }
    }
    newAttachments.forEach((attachment: IUploadingAttachment) => {
      const reader = new FileReader();
      if (Utils.bytesToMegabytes(attachment.file.size) > Const.maxFileUploadSizeMb) {
        attachment.error = 'Слишком большой';
      }
      if (attachment.isImage) {
        reader.onload = (e: any) => {
          attachment.bitmap = e.target.result;
          attachment.isReady = true;
          checkAttachmentsReady();
        };
      } else {
        attachment.isReady = true;
        checkAttachmentsReady();
      }
      reader.readAsDataURL(attachment.file);
    })
  }

  onFilesSelected(event: any): void {
    this.addAttachments(Array.from(event.target?.files) ?? []);
  }
}
