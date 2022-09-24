import {Component, ElementRef, HostListener, OnInit, ViewChild} from '@angular/core';
import {IFocus, IImageData, TFileType} from "../../model/app-model";
import {Observable, of, Subject} from "rxjs";
import {catchError, switchMap, tap} from "rxjs/operators";
import * as d3 from "d3";
import {Const} from "../../model/const";
import {AppService} from "../../services/app.service";
import {HttpClient} from "@angular/common/http";

@Component({
  selector: 'app-image-viewer',
  templateUrl: './image-viewer.component.html',
  styleUrls: ['./image-viewer.component.scss']
})
export class ImageViewerComponent implements OnInit {

  constructor(
    public appService: AppService,
    public httpClient: HttpClient
  ) {}

  @ViewChild('svg') container?: ElementRef;
  @ViewChild('zoomable') zoomable?: ElementRef;

  data: IImageData = {
    imageLoaded: false,
    focusesLoaded: false,
    url: '',
    imageHeight: 0,
    imageWidth: 0,
    focuses: [],
    file: {
      type: 'unknown',
      path: ''
    }
  };

  fileType: TFileType = 'unknown';
  channelId = 0;
  messageId = 0;
  fileId = 0;
  focuses: IFocus[] = [];

  isAnimating = false;

  imageLoaded$ = new Subject<boolean>();

  windowWidth = window.innerWidth;
  windowHeight = window.innerHeight;
  svg: any;
  zoom: any;

  firstFocusInit = false;
  firstFocus = false; // true когда юзер хоть раз дёрнул зум

  ngOnInit(): void {
    const params = (window.location.search.split('?')[1] ?? '').split('-');
    this.channelId = parseInt(params[0], 10);
    this.messageId = parseInt(params[1], 10);
    this.fileId = parseInt(params[2], 10);
    this.data.url = `/file3.php?p=${this.channelId}&m=${this.messageId}&f=${this.fileId}`;

    // TODO: Когда это будет SPA, данные о картинке будут получаться в момент построения ленты.
    // TODO: Т.е. здесь мы уже будем знать тип файла и надо ли его пытаться отобразить.
    // TODO: Пока корявая попытка отобразить, и по получении типа файла - автоскачать.

    // Грузим саму фотку не дожидаясь данных о ней, чтобы не задерживать юзера
    of(this.imageLoaded$).pipe(
      tap(() => {
        this.data.imageLoaded = true;
      })
    ).subscribe();

    // Получаем данные о фотке, строим фокусы
    of({}).pipe(
      switchMap(() => this.loadImageInfo$()),
      tap((input: any) => {

        this.appService.user = input.user;
        this.data = { ...this.data, ...input };
        this.fileType = this.data.file?.type as TFileType;

        switch (this.fileType) {

          case 'file':
            window.location.href = this.getDownloadUrl();
            break;

          case 'image':
            this.focuses = input?.focuses ?? [];
            this.focuses.forEach((f) => {
              this.appService.normalizeLikes(f);
            });

            this.appService.focusesCount.next(this.focuses.length);

            this.applyFirstFocus();
            this.data.focusesLoaded = true;
            break;
        }

      }),
      catchError((e, o) => {
        console.error(e);
        return of();
      })
    ).subscribe();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.windowWidth = event.target.innerWidth;
    this.windowHeight = event.target.innerHeight;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onKeydownHandler(event: KeyboardEvent) {
    if (event.code === 'Escape') {
      this.applyFocus(this.getFirstFocus());
    }
  }

  onImageLoaded(): void {
    this.applyZoomableBehaviour(this.container?.nativeElement, this.zoomable?.nativeElement);

    const boundingBox = this.zoomable?.nativeElement.getBBox();
    if (boundingBox) {
      this.data.imageWidth = boundingBox.width;
      this.data.imageHeight = boundingBox.height;
      this.applyFirstFocus();
    }

    /*const svg = d3.create("svg")
      .attr("viewBox", [0, 0, 1000, 1000]);

    if (!svg) {
      return;
    }

    const circle = svg.selectAll("circle")
      .data([[100, 100]])
      .join("circle")
      .attr("transform", d => `translate(${d})`)
      .attr("r", 1.5);

    svg.node();*/

    this.imageLoaded$.next(true);
  }

  applyZoomableBehaviour(svgElement: HTMLElement, containerElement: HTMLElement) {
    let container: any;

    this.svg = d3.select(svgElement);
    container = d3.select(containerElement);

    this.zoom = d3.zoom().on('zoom', (event: any) => {
      if (this.firstFocusInit) {
        this.firstFocus = true;
      }
      if (!this.isAnimating) {
        // Очистка currentFocus - это исчезновение панельки инфы о фокусе
        // Пока идёт анимация фокусировки, она исчезать не должна
        // Должна только когда юзер подёргал зум
        this.appService.currentFocus = undefined;
      }
      const transform = event.transform;
      container.attr('transform', 'translate(' + transform.x + ',' + transform.y + ') scale(' + transform.k + ')');
      //const t = d3.zoomTransform(containerElement);
    });
    this.svg.call(this.zoom);
  }

  loadImageInfo$(): Observable<any> {
    return this.httpClient.post(
      '/rest-image.php',
      {
        channelId: this.channelId,
        messageId: this.messageId,
        attachmentId: this.fileId
      },
      { observe: 'body', withCredentials: true }
    );
  }

  // Вызывается несколько раз пока не будут получены размеры фотки и данные о фокусах.
  // Создаёт дефолтный фокус, добавляет в начало массива фокусов, фокусируется на нём.
  applyFirstFocus(): void {
    const imageReceived = (this.data.imageWidth || this.data.imageHeight);
    if (imageReceived && !!this.data && !this.focuses.some((f) => f.default)) {
      this.applyFocus(this.getFirstFocus());
      setTimeout(() => {
        this.firstFocus = false;
        this.firstFocusInit = true;
      }, 100);
    }
  }

  getFirstFocus(): IFocus {
    return {
      isNew: false,
      isEditing: false,
      ghost: false,
      l: 0,
      r: this.data.imageWidth,
      t: 0,
      b: this.data.imageHeight,
      sps: 0,
      he: 0,
      nep: 0,
      ogo: 0,
      likes: [],
      default: true,
      maxScale: 2,
    };
  }

  // Приводит позицию и зум на экране к соответствию модели фокуса
  applyFocus(focus: IFocus): void {
    if (focus !== this.appService.currentFocus) {

      let scale = 0;
      let x = 0;
      let y = 0;

      const focusWidth = focus.r - focus.l;
      const focusHeight = focus.b - focus.t;
      const bottomBarHeight = (Const.focusIconMargin + Const.focusIconSize + Const.focusInfoHeight);

      // Если фокус не дефолтный - уменьшим высоту экрана чтобы вместить подпись и лайки
      const windowWidth = this.windowWidth;
      const windowHeight = focus.default ? this.windowHeight : this.windowHeight - bottomBarHeight;

      // Выбираем зум так чтобы всё влезло
      const horizontalScale = windowWidth / focusWidth;
      const verticalScale = windowHeight / focusHeight;
      scale = Math.min(horizontalScale, verticalScale);

      if (focus.maxScale !== undefined) {
        scale = Math.min(scale, focus.maxScale);
      }

      // Задвинем фотку так чтобы фокусируемый участок прижался к левому/верхнему углу
      x = -focus.l * scale;
      y = -focus.t * scale;

      // Сдвиг по осям чтобы фрагмент встал по центру
      x += (windowWidth - (focusWidth * scale)) / 2;
      y += (windowHeight - (focusHeight * scale)) / 2;

      const duration = focus.default ? 0 : 1000;

      this.appService.currentFocus = focus;
      this.isAnimating = true;
      this.svg.transition().duration(duration).call(
        this.zoom.transform,
        d3.zoomIdentity.translate(x, y).scale(scale)
      ).on("end", () => {
        this.isAnimating = false;
      });
    }
  }

  // Текущую позицию и зум на экране превращает в модель фокуса
  takeFocus(): IFocus {
    const t = d3.zoomTransform(this.zoomable?.nativeElement);
    const scale = t.k;
    const left = -(t.x / scale);
    const right = left + (this.windowWidth / scale);
    const top = -(t.y / scale);
    const bottom = top + (this.windowHeight / scale);
    return {
      isNew: false,
      isEditing: false,
      ghost: false,
      l: left,
      r: right,
      t: top,
      b: bottom,
      sps: 0,
      he: 0,
      nep: 0,
      ogo: 0,
      likes: []
    };
  }

  addLike(focus: IFocus, like: string): void {
    if (!focus.alreadyLiked) {
      focus.alreadyLiked = true;
      switch (like) {
        case 'sps':
          focus.sps++;
          break;
        case 'he':
          focus.he++;
          break;
        case 'nep':
          focus.nep++;
          break;
        case 'ogo':
          focus.ogo++;
          break;
      }
      this.appService.normalizeLikes(focus);
      if (!focus.isNew) { // Новый фокус и его лайки существуют ещё только на клиенте
        this.httpClient.post(
          '/rest-image-like-add.php',
          {
            focusId: focus.id,
            like: like
          },
          {observe: 'body', withCredentials: true}
        ).subscribe();
      }
    }
  }

  onAddFocusSaveButton(): void {
    const focus = this.appService.currentFocus;
    if (focus) {
      focus.channelId = this.channelId;
      focus.messageId = this.messageId;
      focus.fileId = this.fileId;

      this.appService.addFocus$(focus).pipe(
        tap((result) => {
          if (!result.error) {
            this.appService.normalizeLikes(result);
            this.focuses.push(result);
            this.appService.currentFocus = result;
            this.appService.focusesCount.next(this.focuses.length);
          }
        })
      ).subscribe();

      if (this.appService.currentFocus) {
        this.appService.currentFocus.isNew = false;
        this.appService.currentFocus.isEditing = false;
      }
    }
  }

  onFocusButton(focus: IFocus): void {
    this.applyFocus(focus);
  }

  onAddFocusButton(): void {
    const f = this.takeFocus();

    f.isNew = true;
    f.isEditing = true;
    f.nick = this.appService.user?.nick;
    f.icon = parseInt(this.appService.user?.icon ?? '0', 10) ?? '-';
    f.sps = 0;
    f.he = 0;
    f.ogo = 0;
    f.nep = 0;
    f.likes = [
      {id: 'sps', count: 0},
      {id: 'he', count: 0},
      {id: 'ogo', count: 0},
      {id: 'nep', count: 0},
    ];

    this.applyFocus(f);
  }

  onAddFocusCancelButton(): void {
    const f = this.appService.currentFocus;
    if (f) {
      f.default = true;
      f.isEditing = false;
      f.isNew = false;
    }
  }

  onCurrentFocusNickClick(): void {
    if (this.appService.currentFocus && this.appService.currentFocus.isEditing) {
      this.appService.currentFocus.ghost = !this.appService.currentFocus.ghost;
    }
  }

  getIconUrl(focus: IFocus): string {
    if (focus.ghost) {
      return '/i/ghost.gif';
    } else {
      if (!focus.icon) {
        return '/i/-.gif';
      } else {
        return '/i/' + focus.icon + '.gif';
      }
    }
  }

  getDownloadUrl(): string {
    return `/file3_download.php?p=${this.channelId}&m=${this.messageId}&f=${this.fileId}`;
  }

  onZoom100Button(): void {
    this.appService.currentFocus = undefined;
    const x = (this.windowWidth / 2) - (this.data.imageWidth / 2);
    const y = (this.windowHeight / 2) - (this.data.imageHeight / 2);

    this.isAnimating = true;
    this.svg.transition().duration(0).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(x, y).scale(1)
    ).on("end", () => {
      this.isAnimating = false;
    });
  }

  onZoomInButton(): void {
    this.appService.currentFocus = undefined;
    const t = d3.zoomTransform(this.zoomable?.nativeElement);
    const f = {...this.takeFocus()};
    f.l += 200 / t.k;
    f.r -= 200 / t.k;
    f.t += 200 / t.k;
    f.b -= 200 / t.k;
    f.default = true;
    this.applyFocus(f);
  }

  onZoomOutButton(): void {
    this.appService.currentFocus = undefined;
    const t = d3.zoomTransform(this.zoomable?.nativeElement);
    const f = {...this.takeFocus()};
    f.l -= 200 / t.k;
    f.r += 200 / t.k;
    f.t -= 200 / t.k;
    f.b += 200 / t.k;
    f.default = true;
    this.applyFocus(f);
  }

}
