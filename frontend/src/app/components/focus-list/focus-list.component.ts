import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  OnInit,
  Output
} from '@angular/core';
import {IFocus, IImageData} from "../../model/app-model";
import {AppService} from "../../services/app.service";
import {tap} from "rxjs/operators";
import {Const} from "../../model/const";

@Component({
  selector: 'app-focus-list',
  templateUrl: './focus-list.component.html',
  styleUrls: ['./focus-list.component.scss']
})
export class FocusListComponent implements OnInit {

  constructor(
    public elementRef: ElementRef,
    public cd: ChangeDetectorRef,
    public appService: AppService,
  ) { }

  ICON_PLUS_MARGIN_SIZE = Const.focusIconSize + Const.focusIconMargin;

  DRAG_STATS_COUNT = 4;
  DRAG_STATS_WEIGHTS = [2.0, 1.5, 1.0, 0.5]; // Чем новее драг, тем он весомее
  DRAG_KEEL = 0.8; // Немножко тяжести чтоб лента не срывалась с руки аки пуля
  AUTOROTATION_BRAKE = 0.8;
  MILLISECONDS_PER_STEP = 20;

  @Output('select')
  readonly selectEmitter = new EventEmitter<IFocus>();

  @Input('data')
  data: IImageData = {
    focusesLoaded: false,
    imageLoaded: false,
    url: '',
    imageHeight: 0,
    imageWidth: 0,
    focuses: [],
    file: {
      type: 'unknown',
      path: ''
    }
  };

  _mouseX: any;
  _mouseY: any;

  _pos = 0; // Позиция наблюдателя на таймлайне
  _previousPos = 0; // предыдущая позиция

  _draggingStartPos: any; // за какое место на таймлайне мы схватились
  _timerDragging: any;
  _dragging = false;
  _dragStats: any; // Массив времён и дельт нескольких последних драгов

  _autorotationSpeed: any;
  _autorotationBrake: any;
  _timerAutorotation: any;

  ngOnInit(): void {
    if (this.data) {
      this.updateContainerWidth();
      this.setPos(0);
    }

    this.appService.focusesCount.pipe(
      tap((count) => {
        this.updateContainerWidth(); // сначала Выясняем новую ширину контейнера...
        setTimeout(() => {
          this.setPos(this.maxPos); // ...и только потом скроллим в его конец
        }, 100);
      }),
    ).subscribe();
  }

  get maxPos(): number {
    const viewportWidth = this.elementRef?.nativeElement?.getBoundingClientRect()?.width ?? 0;
    return this.getContentWidth() - viewportWidth;
  }

  updateContainerWidth(): void {
    this.containerWidth = this.getContentWidth() + 'px';
    this.cd.detectChanges();
  }

  setPos(newPos: any) {
    newPos = Math.max(newPos, 0);
    newPos = Math.min(newPos, this.maxPos);
    this._previousPos = this. _pos;
    this._pos = newPos;
  }

  getContentWidth(): number {
    let w = (this.data.focuses.length * this.ICON_PLUS_MARGIN_SIZE);
    if (w) {
      // После последней иконки маргина нет, вычтем его
      w -= Const.focusIconMargin;
    }
    return w;
  }

  addPos(val: any) {
    this.setPos(this._pos + val);
  }

  @HostBinding('style.width')
  containerWidth = '0px';

  @HostListener('touchstart', ['$event'])
  onTouchStart(e: any) {
    this.startDragging(e.touches[0]?.clientX ?? 0);
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(e: any): void {
    this.startDragging(e.clientX ?? 0);
  }

  @HostListener('window:touchcancel', ['$event'])
  @HostListener('window:touchend', ['$event'])
  onTouchEnd(e: any): void {
    this.stopDragging();
  }

  @HostListener('window:mouseup', ['$event'])
  onMouseUp(e: any): void {
    this.stopDragging();
  }

  @HostListener('touchmove', ['$event'])
  onTouchMove(e: any): void {
    this._mouseX = e.touches[0]?.clientX ?? 0;
    this._mouseY = e.touches[0]?.clientY ?? 0;
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(e: any): void {
    this._mouseX = e.clientX;
    this._mouseY = e.clientY;
  }

  startDragging(x: number): void {
    if (!this._dragging) {
      this.stopAutorotation();

      this._dragging = true;
      this._dragStats = [];
      this._draggingStartPos = this._pos + x;
      this._timerDragging = setInterval(() => this.tickDrag(), this.MILLISECONDS_PER_STEP);
    }
  }

  tickDrag() {
    this.setPos(this._draggingStartPos - (this._mouseX));

    this._dragStats.push(this._pos - this._previousPos);
    if (this._dragStats.length > this.DRAG_STATS_COUNT) {
      this._dragStats.shift();
    }
  }

  stopDragging() {
    if (this._dragging) {
      this._dragging = false;
      clearInterval(this._timerDragging);
      this.startAutorotation(this.calculateDragSpeed());
    }
  }

  calculateDragSpeed() {
    var totalDelta = 0;
    var totalTime = this._dragStats.length * this.MILLISECONDS_PER_STEP;
    for (var i = 0; i < this._dragStats.length; i++) {
      totalDelta += this._dragStats[i] * this.DRAG_STATS_WEIGHTS[i];
    }

    var speed = (totalDelta / totalTime) * this.MILLISECONDS_PER_STEP;
    speed *= this.DRAG_KEEL;
    return speed;
  }

  startAutorotation(speed: number): void {
    this.stopAutorotation();
    this._autorotationSpeed = speed;
    this._autorotationBrake = this._autorotationSpeed > 0 ? -this.AUTOROTATION_BRAKE : this.AUTOROTATION_BRAKE;
    this._timerAutorotation = setInterval(() => this.tickAutorotation(), this.MILLISECONDS_PER_STEP);
  }

  tickAutorotation() {
    var newSpeed = this._autorotationSpeed + this._autorotationBrake;
    var sameSign = (this._autorotationSpeed * newSpeed) > 0; // true если старая и новая скорость направлены в одну сторону

    if (newSpeed == 0 || !sameSign) {
      this.stopAutorotation();
    } else {
      this.addPos(this._autorotationSpeed);
      this._autorotationSpeed += this._autorotationBrake;
    }
  }

  stopAutorotation() {
    this._autorotationSpeed = 0;
    clearInterval(this._timerAutorotation);
  }

  isAutorotation(): boolean {
    return this._autorotationSpeed;
  }

  getFocusButtonStyle(focus: IFocus): string {

    // Чтобы на привьюшке не появлялись чёрные поля если фокус вылезает за пределы картинки
    const f = {...focus};
    f.t = Math.max(f.t, 0);
    f.l = Math.max(f.l, 0);
    f.b = Math.min(f.b, this.data.imageHeight);
    f.r = Math.min(f.r, this.data.imageWidth);

    const windowWidth       = this.ICON_PLUS_MARGIN_SIZE; // На самом деле "окном" тут явлется кнопка фокуса
    const windowHeight      = this.ICON_PLUS_MARGIN_SIZE; // На самом деле "окном" тут явлется кнопка фокуса
    const focusWidth        = f.r - f.l;
    const focusHeight       = f.b - f.t;
    const horizontalScale   = windowWidth / focusWidth;
    const verticalScale     = windowHeight / focusHeight;
    const scale = Math.max(horizontalScale, verticalScale);
    let x = -f.l * scale;
    let y = -f.t * scale;

    // Сдвиг по осям чтобы фрагмент встал по центру
    x += (windowWidth - (focusWidth * scale)) / 2;
    y += (windowHeight - (focusHeight * scale)) / 2;

    return `
      background-image: url(${this.data.url});
      background-size: ${this.data.imageWidth * scale}px ${this.data.imageHeight * scale}px;
      background-position: ${x}px ${y}px;
    `;
  }

  onFocusButton(focus: IFocus): void {
    if (!this.isAutorotation()) {
      this.selectEmitter.emit(focus);
    }
  }

}
