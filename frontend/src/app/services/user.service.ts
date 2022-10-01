import { Injectable } from '@angular/core';
import {BehaviorSubject} from "rxjs";
import {IUserData, LoginStatus} from "../model/app-model";

@Injectable({
  providedIn: 'root'
})
export class UserService {

  constructor() { }

  readonly user: IUserData = {
    icon: '',
    nick: ''
  }

  loginStatus$ = new BehaviorSubject<LoginStatus>(LoginStatus.unauthorised);

  get isAuthorized(): boolean {
    return Boolean(this.loginStatus$.value === LoginStatus.authorised);
  }
}
