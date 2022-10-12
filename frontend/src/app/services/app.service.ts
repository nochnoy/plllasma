import { Injectable } from '@angular/core';
import {Observable, of, Subject} from "rxjs";
import {IChannel, IFocus, ILike, IUserData, LoginStatus} from "../model/app-model";
import {map, switchMap, tap} from "rxjs/operators";
import {HttpClient} from "@angular/common/http";
import {UserService} from "./user.service";

@Injectable({
  providedIn: 'root'
})
export class AppService {

  constructor(
    private httpClient: HttpClient,
    private userService: UserService
  ) { }

  readonly apiPath = '../api';

  user?: IUserData;
  channels: IChannel[] = [];
  focusesCount = new Subject<number>();
  currentFocus?: IFocus;

  normalizeLikes(focus: IFocus): void {
    focus.likes = [
      { id: 'sps', count: Math.min(focus.sps ?? 0, 99) },
      { id: 'he',  count: Math.min(focus.he  ?? 0, 99) },
      { id: 'nep', count: Math.min(focus.nep ?? 0, 99) },
      { id: 'ogo', count: Math.min(focus.ogo ?? 0, 99) }
    ];
  }

  getLikeIcon(like: ILike): string {
    switch(like.id) {
      case 'sps': return '👍';
      case 'he':  return '😄';
      case 'nep': return '🤔';
      case 'ogo': return '😵';
    }
  }

  getLiketitle(like: ILike): string {
    switch(like.id) {
      case 'sps': return 'спс';
      case 'he':  return 'хе';
      case 'nep': return 'неп';
      case 'ogo': return 'ОГО';
    }
  }

  login$(login?: string, password?: string): Observable<boolean> {
    this.userService.loginStatus$.next(LoginStatus.authorising);
    return of({}).pipe(
      switchMap((dialogData) => {
        return this.httpClient.post(
          `${this.apiPath}/login.php`,
          {
            login: login,
            password: password,
          },
          { observe: 'body', withCredentials: true });
      }),
      map((result: any) => !result.error),
      switchMap((result) => {
        if (result) {
          return of({}).pipe(
            switchMap(() => this.loadChannels$()),
            switchMap(() => of(true))
          );
        } else {
          return of(false);
        }
      }),
      tap((success) => {
        this.userService.loginStatus$.next(success ? LoginStatus.authorised : LoginStatus.unauthorised);
      })
    );
  }

  addFocus$(focus: IFocus): Observable<any> {
    return this.httpClient.post(
      `${this.apiPath}/focus-add.php`,
      focus,
      { observe: 'body', withCredentials: true })
  }

  loadChannels$(): Observable<any> {
    return of({}).pipe(
      switchMap(() => {
        return this.httpClient.post(
          `${this.apiPath}/channels.php`,
          { },
          { observe: 'body', withCredentials: true });
      }),
      tap((channels) => this.channels = channels as IChannel[]),
      switchMap(() => of(true))
    );
  }

  getChannel(channelId:number, lastVieved:string): Observable<any> {
    return this.httpClient.post(
      `${this.apiPath}/channel.php`,
      {
        cid: channelId.toString(),
        lv: lastVieved
      },
      { observe: 'body', withCredentials: true })
  }

  getThread(threadId:number, lastVieved:string) {
    return this.httpClient.post(
      `${this.apiPath}/thread.php`,
      {
        tid: threadId.toString(),
        lv: lastVieved
      },
      { observe: 'body', withCredentials: true })
  }

  addMessage$(channelId: number, message: string, parentMessageId?: number): Observable<any> {
    return this.httpClient.post(
      `${this.apiPath}/message-add.php`,
      {
        placeId: channelId,
        message,
        parent: parentMessageId
      },
      { observe: 'body', withCredentials: true })
  }

}
