import { Component, OnInit } from '@angular/core';
import {distinct, distinctUntilChanged, switchMap, tap} from "rxjs/operators";
import {Router} from "@angular/router";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {UserService} from "./services/user.service";
import {AppService} from "./services/app.service";
import {of} from "rxjs";
import { LoginStatus } from './model/app-model';

@UntilDestroy()
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {

  constructor(
    public appService: AppService,
    public userService: UserService,
    public router: Router,
  ) {}

  ngOnInit(): void {
    of({}).pipe(
      switchMap(() => this.appService.authorizeBySession$()), // В начале попытаемся авторизоваться сессией
      switchMap(() => this.userService.loginStatus$), // Дальше слушаем статус авторизованности
      distinct((value) => !!value),
      tap((loginStatus) => {
        switch (loginStatus) {

          case LoginStatus.authorised:
            this.router.navigate(['default']);
            break;
            
          case LoginStatus.unauthorised:
            this.router.navigate(['login']);
            break;

        }
      }),
      untilDestroyed(this)
    ).subscribe();
  }

}
