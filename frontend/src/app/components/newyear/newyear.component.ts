import { Component, OnInit } from '@angular/core';
import {of} from "rxjs";
import {delay, switchMap, tap} from "rxjs/operators";
import {CookieService} from "ngx-cookie-service";

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
      tap(() => this.act = 4), // Гирлянды
    ).subscribe();
  }

}
