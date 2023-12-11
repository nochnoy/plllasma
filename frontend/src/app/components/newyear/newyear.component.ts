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
  // Числа в кадре: 0-темнота, 1-красный, 2-синий, 3-сереневый, 4-жёлтый, 5-зелёный
  readonly glowTune = [
    [4, 0, 0, 5],
    [0, 3, 1, 1],
    [3, 3, 0, 2],
    [0, 1, 4, 4],
    [0, 2, 1, 4],
    [5, 0, 2, 4],
    [0, 5, 0, 4],
    [1, 0, 3, 3],
  ];

  // 4 массива лампочек по цветам
  readonly lampsByColor = [
    [], // 0 - темнота
    [0, 7, 8, 14], // 1 - красный
    [2, 6, 9, 10, 13], // 2 - синий
    [1, 5, 11, 15], // 3 - сереневый
    [3, 4, 12, 16], // 4 - жёлтый
  ];

  act = 0;
  glowingColors: number[] = [];

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
              this.cookieService.set('newyear', year); // Посмотрел. Больше не покажем.
            }),
            delay(1000 * 3)
          );
        }
      }),
      tap(() => this.act = 4), // Играют гирлянды
      switchMap(() => {
        return of({}).pipe(
          switchMap(() => from(this.glowTune).pipe(concatMap(x => of(x).pipe(delay(1000 * 4))))),
          tap((rec) => {
            rec.forEach((color, id) => {
              this.glowingColors[id] = color;
            })
          }),
          repeat(),
        );
      }),
      untilDestroyed(this)
    ).subscribe();
  }

  getGlowClass(id: number): string {
    return `glow glow-${id} glow-color-${(this.glowingColors[id] ?? 0)}`;
  }

  getLampClass(id: number): string {
    const glowingLamps = this.lampsByColor.filter((lamps, color) => this.glowingColors.includes(color));
    const isOn = glowingLamps.some((lamps) => lamps.includes(id));
    const color = this.lampsByColor.findIndex((lamps) =>lamps.find((lamp) => lamp === id));
    return `lamp lamp-${id} lamp-color-${color} ${isOn ? 'on' : ''}`;
  }

}
