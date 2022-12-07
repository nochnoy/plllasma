import { ErrorHandler, Injectable } from '@angular/core';
import {AppService} from "./app.service";

@Injectable({
  providedIn: 'root'
})
export class ErrorService implements ErrorHandler{
  constructor(
    public appService: AppService
  ) {}

  handleError(error: any) {
    setTimeout(() => {
      console?.error(error?.stack);
      this.appService.log('CLIENT ERROR: ' + error?.message);
    }, 1000);
  }
}
