import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding, HostListener,
  Input,
  Output
} from '@angular/core';
import {mozaicDragTreshold} from "../../model/mozaic.model";

type Part = 'l' | 'r' | 't' | 'b' | 'tl' | 'tr' | 'bl' | 'br' ;

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
  mouseDownPart?: Part;
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

  }

  drag(): void {
    if (this.rectBeforeDrag && this.mouseDownPoint) {
      const newRect = new DOMRect(this.rectBeforeDrag.x, this.rectBeforeDrag.y, this.rectBeforeDrag.width, this.rectBeforeDrag.height);
      const deltaX = this.mouseX - this.mouseDownPoint.x;
      const deltaY = this.mouseY - this.mouseDownPoint.y;

      switch (this.mouseDownPart) {
        case 'l': newRect.x += deltaX; newRect.width -= deltaX; break;
        case 'r': newRect.width += deltaX; break;
        case 't': newRect.y += deltaY; newRect.height -= deltaY; break;
        case 'b': newRect.height += deltaY; break;
        case 'tl': newRect.y += deltaY; newRect.height -= deltaY; newRect.x += deltaX; newRect.width -= deltaX; break;
        case 'tr': newRect.y += deltaY; newRect.height -= deltaY; newRect.width += deltaX;  break;
        case 'bl': newRect.height += deltaY; newRect.x += deltaX; newRect.width -= deltaX; break;
        case 'br': newRect.height += deltaY;  newRect.width += deltaX; break;
      }

      this.rect = newRect;
    }
  }

  endDrag(): void {

  }

  onMouseDown(event: MouseEvent, part: Part): void {
    this.updateMouseXY(event);
    event.stopImmediatePropagation(); // Чтобы на это нажатие не среагировала матрица и не начался драг объекта

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
        if (Math.abs(this.mouseX - this.mouseDownPoint.x) > mozaicDragTreshold || Math.abs(this.mouseY - this.mouseDownPoint.y) > mozaicDragTreshold) {
          this.isMouseDownAndMoving = true;
          this.startDrag();
        }
      }
    }
  }
}
