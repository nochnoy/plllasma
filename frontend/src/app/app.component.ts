import { Component, OnInit } from '@angular/core';
import {distinct, distinctUntilChanged, filter, switchMap, tap} from "rxjs/operators";
import {ActivatedRoute, ActivatedRouteSnapshot, Router} from "@angular/router";
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
    public activatedRoute: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    of({}).pipe(
      switchMap(() => this.appService.login$()), // В начале попытаемся авторизоваться сессией
      switchMap(() => this.userService.loginStatus$), // Дальше слушаем статус авторизованности
      tap((loginStatus) => {
        console.log(`loginStatus ${loginStatus}`);
        switch (loginStatus) {

          case LoginStatus.authorised:
            // Мы уже авторизовались а ты всё ещё сидишь на странице логина. Уходи.
            // TODO: возможно надо на самой странице логин слушать статус авторизации и уходить. А это убрать.
            if (this.router.url === '/login') {
              //
              this.router.navigate(['']);
            }
            break;

          case LoginStatus.unauthorised:
            this.router.navigate(['login']);
            break;

        }
      }),
      //filter((loginStatus) => loginStatus === LoginStatus.authorised),
      untilDestroyed(this)
    ).subscribe();
  }

}
