import { Component, OnInit } from '@angular/core';
import {concat, from, of} from "rxjs";
import {concatMap, delay, flatMap, repeat, switchMap, tap} from "rxjs/operators";
import {CookieService} from "ngx-cookie-service";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";

@UntilDestroy()
@Component({
  selector: 'app-newyear',
  templateUrl: './newyear.component.html',
  styleUrls: ['./newyear.component.scss']
})
export class NewyearComponent implements OnInit {

  constructor(
    public cookieService: CookieService
  ) { }

  // Массив кадров, в каждом кадре - номер цвета для каждого из 4х пятен. Цвет 0 = не горит.
  // Позиции в кадре: верх-лево, низ-лево, вехр-право, низ-право
  // Числа в кадре: 0-темнота, 1-красный, 2-синий, 3-сереневый, 4-жёлтый
  readonly glowTune = [
    [4, 0, 0, 5],
    [0, 3, 1, 1],
    [3, 2, 0, 0],
    [0, 1, 4, 4],
    [0, 2, 1, 4],
    [0, 3, 0, 1],
    [0, 4, 0, 4],
    [1, 0, 3, 0],
  ];

  act = 0;
  glowColors: number[] = [];
  glowFast = true;

  ngOnInit(): void {
    const year = (new Date()).getFullYear() + '';
    of({}).pipe(
      switchMap(() => {
        const cookie = this.cookieService.get('newyear');
        if (cookie === year) { // Юзер уже видел появление ёлки. Значит начнём с 4го этапа
          return of({})
        } else {
          return of({}).pipe(
            delay(1000 * 3), tap(() => this.act = 1), // боковая панель мигает
            delay(1000 * 2.1), tap(() => this.act = 2), // открывается дверь, появляется Вейдер
            delay(1000 * 2.2), tap(() => this.act = 3), // Вейдер превращается в ёлку
            tap(() => {
              this.cookieService.set('newyear--', year); // Посмотрел. Больше не покажем.
            }),
            delay(1000 * 3)
          );
        }
      }),
      tap(() => this.act = 4), // Играют гирлянды
      switchMap(() => {
        return of({}).pipe(
          tap(() => {
            this.glowFast = !this.glowFast;
          }),
          switchMap(() => from(this.glowTune).pipe(concatMap(x => of(x).pipe(delay(this.glowFast ? 1000 * 0.3 : 1000 * 2.5))))),
          tap((rec) => {
            rec.forEach((color, id) => {
              this.glowColors[id] = color;
            })
          }),
          repeat(),
        );
      }),
      untilDestroyed(this)
    ).subscribe();
  }

  getGlowClass(id: number): string {
    return `glow glow-${id} glow-color-${(this.glowColors[id] ?? 0)}`;
  }

}
