import {Component, ElementRef, OnDestroy, OnInit, Renderer2, ViewChild} from '@angular/core';
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

  mozaic?: IMozaic;
  rectInterval: any;

  rectX = 0;
  rectWidth = 0;
  cellSize: number = 0;

  ngOnInit(): void {
    this.httpService.mozaicRead$().pipe(
      tap((result) => {
        if (result) {
          this.mozaic = result;
        }
      }),
    ).subscribe();

    this.rectInterval = setInterval(() => {
      const rect = this.elementRef.nativeElement.getBoundingClientRect();
      if (this.rectX !== rect.x || this.rectWidth !== rect.width) {
        this.onRectChanged(rect.x, rect.width);
      }
    }, 1000);

  }

  ngOnDestroy() {
    clearInterval(this.rectInterval);
  }

  onRectChanged(x: number, width: number): void {
    this.rectX = x;
    this.rectWidth = width;
    this.cellSize = width / 12;
  }

}
