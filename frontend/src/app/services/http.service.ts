import { Injectable } from '@angular/core';
import {Observable, of} from "rxjs";
import {switchMap} from "rxjs/operators";
import {HttpClient} from "@angular/common/http";

@Injectable({
  providedIn: 'root'
})
export class HttpService {

  constructor(
    private httpClient: HttpClient,
  ) { }

  static readonly apiPath = '../api';

  loadChannels$(): Observable<any> {
    return of({}).pipe(
      switchMap(() => {
        return this.httpClient.post(
          `${HttpService.apiPath}/channels.php`,
          { },
          { observe: 'body', withCredentials: true }
        );
      })
    );
  }
}
