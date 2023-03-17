import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding, HostListener,
  Input, OnInit,
  Output
} from '@angular/core';
import {matrixDragTreshold} from "../../model/matrix.model";
import {selectionHandleSize, SelectionPart} from "../../model/selection";

@Component({
  selector: 'app-selection',
  templateUrl: './selection.component.html',
  styleUrls: ['./selection.component.scss']
})
export class SelectionComponent {

  constructor(
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef
  ) { }

  mouseDownPoint?: DOMPoint;
  mouseDownPart?: SelectionPart;
  isMouseDownAndMoving = false;
  mouseX = 0;
  mouseY = 0;

  rectValue?: DOMRect;
  rectBeforeDrag?: DOMRect;

  @HostBinding('style.left')    left    = '0px';
  @HostBinding('style.top')     top     = '0px';
  @HostBinding('style.width')   width   = '0px';
  @HostBinding('style.height')  height  = '0px';

  @Input()
  set rect(value: DOMRect | undefined) {
    this.rectValue = value;
    this.updateRect();
  }

  @Output()
  rectChange = new EventEmitter<DOMRect | undefined>();

  @Output()
  dragStart = new EventEmitter();

  @Output()
  dragEnd = new EventEmitter();

  updateMouseXY(event: PointerEvent | MouseEvent): void {
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;
  }

  updateRect(): void {
    if (this.rectValue) {
      this.left    = this.rectValue.x + 'px';
      this.top     = this.rectValue.y + 'px';
      this.width   = this.rectValue.width + 'px';
      this.height  = this.rectValue.height + 'px';
    }
    this.cdr.detectChanges();
  }

  startDrag(): void {
    this.dragStart.emit();
  }

  drag(): void {
    if (this.rectBeforeDrag && this.mouseDownPoint) {
      const newRect = new DOMRect(this.rectBeforeDrag.x, this.rectBeforeDrag.y, this.rectBeforeDrag.width, this.rectBeforeDrag.height);
      const deltaX = this.mouseX - this.mouseDownPoint.x;
      const deltaY = this.mouseY - this.mouseDownPoint.y;
      let [r, l, t, b] = [false, false, false, false];

      switch (this.mouseDownPart) {
        case 'l': l = true; break;
        case 'r': r = true; break;
        case 't': t = true; break;
        case 'b': b = true; break;
        case 'tl': t = true; l = true; break;
        case 'tr': t = true; r = true; break;
        case 'bl': b = true; l = true; break;
        case 'br': b = true; r = true; break;
      }

      if (l) {
        if (newRect.width - deltaX < selectionHandleSize) {
          newRect.x = (newRect.x + newRect.width) - selectionHandleSize;
          newRect.width = selectionHandleSize;
        } else {
          newRect.x += deltaX;
          newRect.width -= deltaX;
        }
      }

      if (r) {
        if (newRect.width + deltaX < selectionHandleSize) {
          newRect.width = selectionHandleSize;
        } else {
          newRect.width += deltaX;
        }
      }

      if (t) {
        if (newRect.height - deltaY < selectionHandleSize) {
          newRect.y = (newRect.y + newRect.height) - selectionHandleSize;
          newRect.height = selectionHandleSize;
        } else {
          newRect.y += deltaY;
          newRect.height -= deltaY;
        }
      }

      if (b) {
        if (newRect.height + deltaY < selectionHandleSize) {
          newRect.height = selectionHandleSize;
        } else {
          newRect.height += deltaY;
        }
      }

      this.rect = newRect;
      this.rectChange.emit(newRect);
    }
  }

  endDrag(): void {
    this.dragEnd.emit();
  }

  onMouseDown(event: MouseEvent, part: SelectionPart): void {
    this.updateMouseXY(event);
    event.stopImmediatePropagation(); // Чтобы на это нажатие не среагировала матрица и не начался драг объекта
    event.preventDefault(); // Чтобы при таскании не появлялся курсор "not-allowed"

    this.rectBeforeDrag = this.elementRef.nativeElement.getBoundingClientRect();
    this.mouseDownPoint = new DOMPoint(event.clientX, event.clientY);
    this.mouseDownPart = part;
    this.isMouseDownAndMoving = false;
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: PointerEvent) {
    this.updateMouseXY(event);

    // Что бы это ни было, оно закончилось. Знаканчиваем следить.
    this.endDrag();
    delete this.mouseDownPoint;
    this.isMouseDownAndMoving = false;
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: PointerEvent) {
    this.updateMouseXY(event);
    if (this.mouseDownPoint) {
      if (this.isMouseDownAndMoving) {
        this.drag();
      } else {
        if (Math.abs(this.mouseX - this.mouseDownPoint.x) > matrixDragTreshold || Math.abs(this.mouseY - this.mouseDownPoint.y) > matrixDragTreshold) {
          this.isMouseDownAndMoving = true;
          this.startDrag();
        }
      }
    }
  }
}
