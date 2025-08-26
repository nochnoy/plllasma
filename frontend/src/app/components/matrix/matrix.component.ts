import {Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output,} from '@angular/core';
import {
  IMatrix,
  IMatrixObject,
  IMatrixObjectTransform,
  IMatrixRect,
  matrixAddCol,
  matrixCellSize,
  matrixColsCount,
  matrixDragThreshold,
  matrixFlexCol,
  matrixGap,
  MatrixObjectTypeEnum
} from "../../model/matrix.model";
import {Channel} from "../../model/messages/channel.model";
import {IUploadingAttachment} from "../../model/app-model";
import {Utils} from "../../utils/utils";
import {Const} from "../../model/const";
import {filter, switchMap, tap} from "rxjs/operators";
import {of, Subject} from "rxjs";
import {IHttpAddMatrixImages} from "../../model/rest-model";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {UploadService} from "../../services/upload.service";
import {AppService} from "../../services/app.service";
import {UserService} from "../../services/user.service";
import {HttpService} from "../../services/http.service";

@UntilDestroy()
@Component({
  selector: 'app-matrix',
  templateUrl: './matrix.component.html',
  styleUrls: ['./matrix.component.scss']
})
export class MatrixComponent implements OnInit, OnDestroy {

  constructor(
    public appService: AppService,
    public uploadService: UploadService,
    public elementRef: ElementRef,
    public userService: UserService,
    public httpService: HttpService,
  ) { }

  readonly objectTypeText = MatrixObjectTypeEnum.text;
  readonly objectTypeImage = MatrixObjectTypeEnum.image;
  readonly objectTypeTitle = MatrixObjectTypeEnum.title;

  @Output('change')
  change = new EventEmitter<IMatrix>();

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

  @Input('collapsed')
  collapsed = false;

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

  // Слушаем мышь /////////////////////////////////////////////////////////////

  @HostListener('document:mousedown', ['$event'])
  onMouseDown(event: PointerEvent) {
    this.updateMouseXY(event);
    this.isMouseDown = true;
    this.isMouseDownAndMoving = false;
    this.mouseDownPoint = new DOMPoint(event.pageX, event.pageY);

    const block: any = event?.target;
    const id = parseInt(block.id);
    this.mouseDownObject = this.matrix?.objects?.find((object) => object.id === id) ?? undefined;
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
        if (Math.abs(event.pageX - this.mouseDownPoint.x) > matrixDragThreshold || Math.abs(event.pageY - this.mouseDownPoint.y) > matrixDragThreshold) {

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

  @HostListener('document:mouseleave', ['$event'])
  onMouseOutWindow(event: PointerEvent) {
    if (!this.selectedObject && this.softSelectedObject) {
      this.deselect();
    }
  }

  // Мышь и границы ///////////////////////////////////////////////////////////

  updateMouseXY(event: PointerEvent | MouseEvent): void {
    this.mouseX = event.pageX;
    this.mouseY = event.pageY;
  }

  updateMatrixRect(): void {
    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    rect.x += window.scrollX;
    rect.y += window.scrollY;

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
      this.change.emit(this.matrix);
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
      this.updateMatrixHeight();
    }
  }

  endDrag(): void {
    this.isDragging = false;
    if (this.transform) {
      this.transform.resultMatrixRect.w = Math.max(1, this.transform.resultMatrixRect.w);
      this.transform.resultMatrixRect.h = Math.max(1, this.transform.resultMatrixRect.h);

      this.transform.object.x = this.transform.resultMatrixRect.x;
      this.transform.object.y = this.transform.resultMatrixRect.y;
      this.transform.object.w = this.transform.resultMatrixRect.w;
      this.transform.object.h = this.transform.resultMatrixRect.h;
      this.transform.object.domRect = this.matrixRectToDomRect(this.transform.object);
      this.destroyTransform();
      this.updateSelectionRect();
      this.updateMatrixHeight();
      this.change.emit(this.matrix);
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

        case MatrixObjectTypeEnum.text:
        case MatrixObjectTypeEnum.title:
          const channelId = this.channel?.id ?? -1;
          if (this.userService.canEditMatrix(channelId)) {
            const newText = window.prompt('Введите новый текст', this.selectedObject.text) ?? '';
            if (newText && newText !== this.selectedObject.text) {
              this.selectedObject.text = newText;
              this.change.emit(this.matrix);
            }
          }
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
      const leftSide = Math.max(0, w - Math.max(0, x + w - matrixFlexCol)); // часть блока слева от 13го столбца
      const inAndRightSide = Math.max(0, w - leftSide); // внутренняя плюс правая часть

      const shrinkSize = flexColCapacity - xShift;
      const inAndRightSideShrinked = Math.max(1, inAndRightSide - Math.min(shrinkSize, inAndRightSide - 1));

      w = leftSide + inAndRightSideShrinked;
      w = Math.max(1, w);
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

    if (this.transform?.resultMatrixRect) {
      h = Math.max(h, this.transform?.resultMatrixRect.y + this.transform?.resultMatrixRect.h);
    }
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

  getFreeY(): number {
    let y = 0;
    this.matrix.objects.forEach((o) => {
      const newY = o.y + o.h;
      y = Math.max(y, newY);
    });
    return y;
  }

  // Слушаем клаву /////////////////////////////////////////////////////////////

  @HostListener('document:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent) {
    if (this.matrix.objects && this.selectedObject) {
      if (event.key === 'Delete') {
        if (document.activeElement?.nodeName === 'BODY') { // признак того что курсор не стоит в поле ввода ;\
          this.deleteCommand();
        }
      }
    }
  }

  // Команды юзера /////////////////////////////////////////////////////////////

  addTextCommand(): void {
    if (this.channel?.matrix) {
      const text = (window.prompt('Введите текст') ?? '').trim();
      if (text) {
        let w = 4;
        let h = 1;
        let x = matrixAddCol;
        let y = this.getFreeY();

        const o: IMatrixObject = {
          type: MatrixObjectTypeEnum.text,
          y, x, w, h, text,
          id: this.matrix.newObjectId++,
          changed: this.now(),
        };
        this.matrix.objects.push(o);
        this.select(o);
        this.updateMatrixHeight();
        this.change.emit(this.matrix);
        this.channel.viewed = this.now(); // Чтобы на объекте не появилась звёздочка
      }
    }
  }

  addTitleCommand(): void {
    if (this.channel?.matrix) {
      const text = (window.prompt('Введите текст') ?? '').trim();
      if (text) {
        let w = 4;
        let h = 1;
        let x = matrixAddCol;
        let y = this.getFreeY();

        const o: IMatrixObject = {
          type: MatrixObjectTypeEnum.title,
          y, x, w, h, text,
          id: this.matrix.newObjectId++,
          changed: this.now(),
        };
        this.matrix.objects.push(o);
        this.select(o);
        this.updateMatrixHeight();
        this.change.emit(this.matrix);
        this.channel.viewed = this.now(); // Чтобы на объекте не появилась звёздочка
      }
    }
  }

  addImageCommand(): void {
    of({}).pipe(
      switchMap(() => this.uploadService.upload()),
      switchMap((files) => { // Подготовим файлы
        const result = new Subject<IUploadingAttachment[]>();
        if (files.length) {

          let newAttachments: IUploadingAttachment[] = files.map((file) => {
            return {
              file: file,
              isImage: file?.type?.split('/')[0] === 'image',
              isReady: false
            } as IUploadingAttachment;
          });
          const checkAttachmentsReady = () => {
            if (!newAttachments.some((attachment) => !attachment || !attachment.isReady)) {
              newAttachments = newAttachments.filter((attachment) => attachment.isImage); // только картинки
              const erroredAttachment = newAttachments.find((attachment) => attachment.error);
              if (erroredAttachment) {
                // Нашли аттач с ошибкой, очищаем все - ничего загружать не будем
                alert(`${erroredAttachment.file.name} ${erroredAttachment.error}`);
                newAttachments = [];
              }
              result.next(newAttachments);
            }
          }
          newAttachments.forEach((attachment: IUploadingAttachment) => {
            const reader = new FileReader();
            if (Utils.bytesToMegabytes(attachment.file.size) > Const.maxFileUploadSizeMb) {
              attachment.error = 'слишком большой';
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
        return result;
      }),
      filter((attachments: IUploadingAttachment[]) => !!attachments?.length),
      switchMap((attachments: IUploadingAttachment[]) => {
        return this.appService.addMatrixImages$(this.channel!.id, attachments);
      }),
      switchMap((result: IHttpAddMatrixImages) => {
        let imagesSaved = false;
        if (result.error) {
          alert(result.errorMessage);
          console.error(result.error); // TODO: сделать вывод ошибок, с логированием
        } else {
          const images = result.images;
          if (images && images.length) {
            images.forEach((image) => {
              if (this.channel?.matrix) {
                let w = 3;
                let h = 3
                let x = matrixAddCol;
                let y = this.getFreeY();

                const o: IMatrixObject = {
                  type: MatrixObjectTypeEnum.image,
                  y, x, w, h,
                  color: 'black',
                  image: image,
                  id: this.matrix.newObjectId++,
                  changed: this.now(),
                };
                this.matrix.objects.push(o);
                this.select(o);
              }
            });

            this.updateMatrixHeight();
            this.change.emit(this.matrix);
            if (this.channel) {
              this.channel.viewed = this.now(); // Чтобы на объекте не появилась звёздочка
            }
            imagesSaved = true;
          }
        }
        return of(imagesSaved);
      }),
      switchMap((imagesSaved: boolean) => {
        if (imagesSaved && this.channel) {
          return this.httpService.updateChannelChangedTime$(this.channel?.id);
        } else {
          return of({});
        }
      }),
      untilDestroyed(this)
    ).subscribe();
  }

  deleteCommand(): void {
    if (window.confirm('Удалить выделенный объект?')) {
      const deletedObject = this.selectedObject;
      this.deselect();
      this.matrix.objects = this.matrix.objects.filter((o) => o !== deletedObject);
      this.updateMatrixHeight();
      this.change.emit(this.matrix);
    }
  }

  clearCommand(): void {
    if (window.confirm('Удалить все текстовые и картиночные блоки?')) {
      if (this.matrix.objects) {
        this.matrix.objects.length = 0;
        this.updateMatrixHeight();
        this.change.emit(this.matrix);
      }
    }
  }

  now(): string {
    return Utils.dateToTimestamp(new Date());
  }
}
