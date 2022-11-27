import { Component, OnInit } from '@angular/core';
import {FormGroup, FormControl, RequiredValidator, Validators} from '@angular/forms';
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {UserService} from "../../services/user.service";
import {AppService} from "../../services/app.service";
import {tap} from "rxjs/operators";

@UntilDestroy()
@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss']
})
export class LoginPageComponent {

  constructor(
    public appService: AppService,
  ) { }

  form = new FormGroup({
    login: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.required]),
  });

  authorizing = false;
  error = 0;

  onLogin(): void {
    this.authorizing = true;
    this.form.markAsPristine();
    this.form.disable();

    const login = this.form.get('login')?.value ?? '';
    const password = this.form.get('password')?.value ?? '';
    this.appService.login$(login, password).pipe(
      tap((result) => {
        this.authorizing = false;
        this.form.enable();
        if (result) {
          this.error = 0;
        } else {
          if (++this.error > 4) {
            this.error = 1;
          }
        }
      }),
      untilDestroyed(this)
    ).subscribe();
  }

}
