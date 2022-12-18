import { Injectable } from '@angular/core';
import {Observable, of} from "rxjs";
import {map, switchMap} from "rxjs/operators";
import {HttpClient} from "@angular/common/http";
import {IMailMessage, IMember} from "../model/app-model";

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

  getChannel$(channelId:number, lastVieved:string, page = 0, unseen = false): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/channel.php`,
      {
        cid: channelId.toString(),
        lv: lastVieved,
        page,
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

  likeMessage(messageId: number, like: 'sps' | 'heh' | 'nep' | 'ogo'): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/like.php`,
      {
        messageId,
        like
      },
      {observe: 'body', withCredentials: true}
    );
  }

  getMembers$(nick?: string): Observable<IMember[]> {
    return this.httpClient.post(
      `${HttpService.apiPath}/members.php`,
      {
        nick
      },
      {observe: 'body', withCredentials: true}
    ).pipe(
      map((result: any) => {
        return result?.users as IMember[];
      })
    );
  }

  incrementMemberVisits$(nick: string): any {
    return this.httpClient.post(
      `${HttpService.apiPath}/member-visits-increment.php`,
      {
        nick
      },
      {observe: 'body', withCredentials: true}
    );
  }

  getMail$(nick: string): Observable<IMailMessage[]> {
    return this.httpClient.post(
      `${HttpService.apiPath}/mail-read.php`,
      {
        nick
      },
      {observe: 'body', withCredentials: true}
    ).pipe(
      map((result: any) => {
        return result?.messages as IMailMessage[];
      })
    );
  }

  sendMail$(nick: string, message: string): Observable<IMailMessage[]> {
    return this.httpClient.post(
      `${HttpService.apiPath}/mail-write.php`,
      {
        nick,
        message
      },
      {observe: 'body', withCredentials: true}
    ).pipe(
      map((result: any) => {
        return result?.messages as IMailMessage[];
      })
    );
  }

}
