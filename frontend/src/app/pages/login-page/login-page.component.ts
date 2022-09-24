import { Component, OnInit } from '@angular/core';
import { FormGroup, FormControl } from '@angular/forms';
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {UserService} from "../../services/user.service";
import {AppService} from "../../services/app.service";

@UntilDestroy()
@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss']
})
export class LoginPageComponent implements OnInit {

  constructor(
    public appService: AppService
  ) { }

  form = new FormGroup({
    login: new FormControl(''),
    password: new FormControl(''),
  });

  ngOnInit(): void {
    this.buildForm();
  }

  buildForm(): void {

  }

  onLogin(): void {
    const login = this.form.get('login')?.value ?? '';
    const password = this.form.get('password')?.value ?? '';
    this.appService.authorize$(login, password).pipe(
      untilDestroyed(this)
    ).subscribe();
  }

}
