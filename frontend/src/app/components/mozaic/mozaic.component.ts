import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
} from '@angular/core';
import {HttpService} from "../../services/http.service";
import {tap} from "rxjs/operators";
import {IMozaic, IMozaicItem, mozaicDragTreshold} from "../../model/mozaic.model";

@Component({
  selector: 'app-mozaic',
  templateUrl: './mozaic.component.html',
  styleUrls: ['./mozaic.component.scss']
})
export class MozaicComponent implements OnInit, OnDestroy {

  constructor(
    public httpService: HttpService,
    private elementRef: ElementRef,
  ) { }

  readonly mozaicGap = 5; // должна быть равна css-переменной --mozaic-gap

  mozaic = {} as IMozaic;
  mozaicRect: DOMRect = new DOMRect(0,0,0,0);
  mozaicRectUpdateInterval: any;
  cellSize: number = 0;
  isEditMode = true; // Когда юзер редактирует мозайку

  mouseX = 0;
  mouseY = 0;
  mouseDownPoint?: DOMPoint; // точка где была зажата мышка
  mouseDownItem?: IMozaicItem; // блок на котором была зажата мышка
  isMouseDownAndMoving = false; // мы зажали мышь и тащим её?

  selectedItem?: IMozaicItem;
  selectionRectValue?: DOMRect;

  draggingItem?: IMozaicItem;
  draggingItemX = 0;
  draggingItemY = 0;
  draggingItemCellX = 0;
  draggingItemCellY = 0;

  get selectionRect(): DOMRect | undefined {
    return this.selectionRectValue;
  }
  set selectionRect(value: DOMRect | undefined) {
    this.selectionRectValue = value;
    if (value && this.draggingItem) {
      this.draggingItem.x = Math.floor((value.x - this.mozaicRect.x) / this.cellSize);
      this.draggingItem.y = Math.floor((value.y - this.mozaicRect.y) / this.cellSize);
      this.draggingItem.w = 1;
      this.draggingItem.h = 1;
    }
  }

  ngOnInit(): void {
    this.httpService.mozaicRead$().pipe(
      tap((result) => {
        if (result) {
          this.mozaic = result;
        }
      }),
    ).subscribe();

    this.updateMozaicRect();
    this.mozaicRectUpdateInterval = setInterval(() => this.updateMozaicRect(), 1000);
  }

  ngOnDestroy() {
    clearInterval(this.mozaicRectUpdateInterval);
  }

  updateMozaicRect(): void {
    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    const mr = this.mozaicRect;
    if (!this.cellSize || rect.x !== mr.x || rect.y !== mr.y || rect.width !== mr.width || rect.height !== mr.height) {
      this.mozaicRect = rect;
      this.cellSize = this.mozaicRect.width / 12;
      this.updateSelectionRect();
    }
  }

  isMouseInsideRect(): boolean {
    if (this.mouseX >= this.mozaicRect.x && this.mouseX <= this.mozaicRect.x + this.mozaicRect.width) {
      if (this.mouseY >= this.mozaicRect.y && this.mouseY <= this.mozaicRect.y + this.mozaicRect.height) {
        return true;
      }
    }
    return false;
  }

  isXYInsideItem(x: number, y: number, item: IMozaicItem): boolean {
    const cellX = Math.round((x - this.mozaicRect.x) / this.cellSize);
    const cellY = Math.round((y - this.mozaicRect.y) / this.cellSize);
    return (cellX >= item.x && cellX <= item.x + item.w) && (cellY>= item.y && cellY <= item.y + item.h);
  }

  select(item: IMozaicItem): void {
    if (item !== this.selectedItem) {
      if (this.selectedItem) {
        this.deselect();
      }

      this.selectedItem = item;
      this.selectedItem.selected = true;
      this.updateSelectionRect();

      // Выделенный всегда всплывает наверх
      this.mozaic!.items = this.mozaic?.items.filter((i) => i !== item);
      this.mozaic!.items.push(this.selectedItem);
    }
  }

  updateSelectionRect(): void {
    if (this.selectedItem) {
      if (!this.draggingItem) {
        const x = this.mozaicRect.x + this.selectedItem.x * this.cellSize;
        const y = this.mozaicRect.y + this.selectedItem.y * this.cellSize;
        this.selectionRect = new DOMRect(x, y, this.selectedItem.w * this.cellSize, this.selectedItem.h * this.cellSize);
      } else {
        this.selectionRect = undefined;
      }
    } else {
      this.selectionRect = undefined;
    }
  }

  deselect(): void {
    if (this.selectedItem) {
      this.selectedItem.selected = false;
    }
    delete this.selectedItem;
    this.selectionRect = undefined;
  }

  onSelectionDrag(value: boolean): void {
    if (this.selectedItem) {
      if (value) {
        this.draggingItem = this.selectedItem;
      } else {
        this.draggingItem = undefined;
      }
    }
  }

  updateMouseXY(event: PointerEvent | MouseEvent): void {
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;
  }

  updateDragXY(): void {
    if (this.mouseDownPoint && this.draggingItem) {
      const shiftX = this.mouseX - this.mouseDownPoint.x;
      const shiftY = this.mouseY - this.mouseDownPoint.y;
      this.draggingItemX = this.mozaicRect.x + (this.draggingItem.x * this.cellSize) + shiftX;
      this.draggingItemY = this.mozaicRect.y + (this.draggingItem.y * this.cellSize) + shiftY;
      this.draggingItemCellX = Math.round((this.draggingItemX - this.mozaicRect.x) / this.cellSize);
      this.draggingItemCellY = Math.round((this.draggingItemY - this.mozaicRect.y) / this.cellSize);
    }
  }

  startDrag(): void {
    if (!this.draggingItem) {
      this.draggingItem = this.selectedItem;
      this.updateDragXY();
      this.updateSelectionRect();
    }
  }

  endDrag(): void {
    if (this.draggingItem) {
      this.updateDragXY();
      this.draggingItem.x = this.draggingItemCellX;
      this.draggingItem.y = this.draggingItemCellY;
      delete this.draggingItem;
      this.updateSelectionRect();
    }
  }

  drag(): void {
    if (this.draggingItem) {
      this.updateDragXY();
    }
  }

  onClickItem(): void {
    if (this.mouseDownItem) {
      this.select(this.mouseDownItem);
    }
    return undefined;
  }

  @HostListener('document:mousedown', ['$event'])
  onMouseDown(event: PointerEvent) {
    this.updateMouseXY(event);
    this.isMouseDownAndMoving = false;
    this.mouseDownPoint = new DOMPoint(event.clientX, event.clientY);

    const block: any = event?.target;
    const id = parseInt(block.id);
    this.mouseDownItem = this.mozaic?.items.find((item) => item.id === id) ?? undefined;
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: PointerEvent) {
    this.updateMouseXY(event);

    let needToDeselect = false;
    if (this.mouseDownPoint) {
      if (!this.isMouseDownAndMoving) {
        if (this.isMouseInsideRect()) {
          // мышь не двигалась, mouseup там-же где и mousedown - значит это был клик
          this.onClickItem();
          if (!this.mouseDownItem) {
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
    if (!this.mouseDownItem && this.selectedItem && this.isXYInsideItem(this.mouseX, this.mouseY, this.selectedItem)) {
      this.mouseDownItem = this.selectedItem;
    }

    if (this.mouseDownPoint && this.mouseDownItem) {
      if (this.isMouseDownAndMoving) {
        this.drag();
      } else {
        if (Math.abs(event.clientX - this.mouseDownPoint.x) > mozaicDragTreshold || Math.abs(event.clientY - this.mouseDownPoint.y) > mozaicDragTreshold) {

          // Выделяем то что тащим
          if (this.mouseDownItem !== this.selectedItem) {
            this.select(this.mouseDownItem);
          }

          this.isMouseDownAndMoving = true;
          this.startDrag();
        }
      }
    }
  }

}
