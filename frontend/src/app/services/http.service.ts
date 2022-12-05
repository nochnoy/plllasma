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

  getChannel$(channelId:number, lastVieved:string, unseen = false): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/channel.php`,
      {
        cid: channelId.toString(),
        lv: lastVieved,
        unseen
      },
      { observe: 'body', withCredentials: true }
    )
  }

  getHereAndNow$(): Observable<string[]> {
    return this.httpClient.post(
      `${HttpService.apiPath}/hereandnow.php`,
      {},
      { observe: 'body', withCredentials: true }
    ).pipe(
      switchMap((result: any) => {
        if (Array.isArray(result)) {
          return of(result);
        } else {
          return of([]);
        }
      })
    );
  }

  log(message: string): void {
    this.httpClient.post(
      `${HttpService.apiPath}/log.php`,
      {
        message
      },
      { observe: 'body', withCredentials: true }
    ).subscribe();
  }

  likeMessage(messageId: number, like: 'sps' | 'heh' | 'nep' | 'ogo') {
    this.httpClient.post(
      `${HttpService.apiPath}/like.php`,
      {
        messageId,
        like
      },
      {observe: 'body', withCredentials: true}
    ).subscribe();
  }

}
