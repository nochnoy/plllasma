import { Component, OnInit } from '@angular/core';
import {of} from "rxjs";
import {delay, repeat, switchMap, tap} from "rxjs/operators";
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

  act = 0;
  isRedOn = false;
  isBlueOn = false;
  isGreenOn = false;
  isGoldOn = false;

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
      tap(() => this.act = 4), // Гирлянды
      switchMap(() => {
        return of({}).pipe(
          delay(1000 * 2),
          tap(() => {
            let count = 2;
            let lights: number[] = [];
            if (Math.random() > 0.6) {
              count = 3;
            }
            while(lights.length < count) {
              const l = Math.floor(Math.random() * 4 + 1);
              if (!lights.includes(l)) {
                lights.push(l);
              }
            }
            this.isRedOn = lights.includes(1);
            this.isBlueOn = lights.includes(2);
            this.isGreenOn = lights.includes(3);
            this.isGoldOn = lights.includes(4);
          }),
          repeat(),
        );
      }),

      untilDestroyed(this)
    ).subscribe();
  }

}
