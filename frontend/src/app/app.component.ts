import {Component, OnInit, AfterViewInit, Renderer2, ViewChild, ElementRef} from '@angular/core';
import {switchMap, tap} from "rxjs/operators";
import {Router} from "@angular/router";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {UserService} from "./services/user.service";
import {AppService} from "./services/app.service";
import {of} from "rxjs";
import { LoginStatus } from './model/app-model';
import {UploadService} from "./services/upload.service";

@UntilDestroy()
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, AfterViewInit {

  @ViewChild('fileUpload') fileUpload?: ElementRef;

  constructor(
    public appService: AppService,
    public userService: UserService,
    public renderer: Renderer2,
    public router: Router,
    public uploadService: UploadService,
  ) {}

  ngOnInit(): void {
    of({}).pipe(
      switchMap(() => this.appService.login$()), // В начале попытаемся авторизоваться сессией
      switchMap(() => this.userService.loginStatus$), // Дальше слушаем статус авторизованности
      tap((loginStatus) => {
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

  ngAfterViewInit() {
    let loader = this.renderer.selectRootElement('#probloader');
    if (loader && loader.parentNode) {
      this.renderer.removeChild(loader.parentNode, loader);
    }
    if (this.fileUpload) {
      this.uploadService.registerUploadInput(this.fileUpload);
    }
  }

  onFilesSelected(event: any): void {
    this.uploadService.onFilesSelected(Array.from(event.target?.files) ?? []);
  }

}
