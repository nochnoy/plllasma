import {Component, ElementRef, HostListener, OnDestroy, OnInit, Renderer2, ViewChild} from '@angular/core';
import {HttpService} from "../../services/http.service";
import {IMozaic, IMozaicItem} from "../../model/app-model";
import {tap} from "rxjs/operators";

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

  mozaic = {} as IMozaic;
  rectInterval: any;
  rect: DOMRect = new DOMRect(0,0,0,0);
  cellSize: number = 0;
  selectedItem?: IMozaicItem;
  isDragging = false;
  dragStart?: DOMPoint;

  ngOnInit(): void {
    this.httpService.mozaicRead$().pipe(
      tap((result) => {
        if (result) {
          this.mozaic = result;
        }
      }),
    ).subscribe();

    this.rectInterval = setInterval(() => {
      this.rect = this.elementRef.nativeElement.getBoundingClientRect();
      this.cellSize = this.rect.width / 12;
    }, 1000);
  }

  ngOnDestroy() {
    clearInterval(this.rectInterval);
  }

  isInsideRect(event: PointerEvent): boolean {
    if (event.clientX >= this.rect.x && event.clientX <= this.rect.y + this.rect.width) {
      if (event.clientY >= this.rect.y && event.clientY <= this.rect.y + this.rect.height) {
        return true;
      }
    }
    return false;
  }

  @HostListener('document:mousedown', ['$event'])
  onMouseDown(event: PointerEvent) {
    console.log('mousedown');
    this.dragStart = new DOMPoint(event.clientX, event.clientY);
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: PointerEvent) {
    if (this.dragStart) {
      console.log('mousemove');



    }
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: PointerEvent) {
    console.log('mouseup');
    delete this.dragStart;
  }

  @HostListener('document:click', ['$event'])
  onClick(event: PointerEvent) {
    if (this.isInsideRect(event)) {
      const block: any = event?.target;
      const id = parseInt(block.id);
      const item = this.mozaic?.items.find((item) => item.id === id);
      if (item) {

        if (this.selectedItem) {
          this.selectedItem.selected = false;
        }

        this.selectedItem = item;
        this.selectedItem.selected = true;

        // Выделенный всегда всплывает наверх
        this.mozaic!.items = this.mozaic?.items.filter((i) => i !== item);
        this.mozaic!.items.push(this.selectedItem);

        const cellX = (event.clientX - this.rect.x) / this.cellSize;
        const cellY = (event.clientY - this.rect.y) / this.cellSize;
        const shiftX = cellX % 1;
        const shiftY = cellY % 1;

        console.log(`YOU VE BEEN CLICKING ${cellX}:${cellY} WITH SHIFT ${shiftX}:${shiftY}`);

      }
    }
  }

}
