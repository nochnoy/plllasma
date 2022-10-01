import { Injectable } from '@angular/core';
import {BehaviorSubject} from "rxjs";
import {IUserData} from "../model/app-model";

@Injectable({
  providedIn: 'root'
})
export class UserService {

  constructor() { }

  readonly user: IUserData = {
    icon: '',
    nick: ''
  }

  isAuthorized$ = new BehaviorSubject<boolean>(false);
  authorisationInProgress = false;

  get isAuthorized(): boolean {
    return Boolean(this.isAuthorized$.value);
  }
}
