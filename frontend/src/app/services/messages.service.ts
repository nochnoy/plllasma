import { Injectable } from '@angular/core';
import {HttpClient, HttpErrorResponse, HttpHeaders, HttpParams} from "@angular/common/http";
import {TopSecret} from "../model/messages/top-secret";
import {Observable} from "rxjs";
import {tap} from "rxjs/operators";

@Injectable({
  providedIn: 'root'
})
export class MessagesService {

  public colorBg = '#F4E5D7';
  public colorText = '#313e41';
  public colorDigest = '#ADA99A';

  private headers: HttpHeaders;

  constructor(
    private http: HttpClient
  ) {
    this.headers = new HttpHeaders();
    this.headers = this.headers.set('Content-Type', 'application/json; charset=utf-8');
  }

  /**
   * Запрашивает с сервера сообщения канала
   */
  public getChannel(channelId:number, lastVieved:string, callback:Function): Observable<any> {
    const params = (new HttpParams())
      .append("cmd",  "get_channel")
      .append("cid",  channelId.toString())
      .append("lv",   lastVieved);

    return this.http.post(TopSecret.ApiPath, null, {headers: this.headers, params:params}).pipe(
      tap((input) => {
        this.logInput(input);
        if (callback)
          callback(input);
      })
    )
  }

  /**
   * Запрашивает с сервера сообщения одного треда
   */
  public getThread(threadId:number, lastVieved:string, callback:Function)
  {
    const params = (new HttpParams())
      .append("cmd",  "get_thread")
      .append("tid",  threadId.toString())
      .append("lv",   lastVieved);

    this.http.post(TopSecret.ApiPath, null, {headers: this.headers, params:params}).subscribe(
      input => {
        this.logInput(input);
        if (callback)
          callback(input);
      },
      (err: HttpErrorResponse) => {
        console.error(err.error);
      }
    )
  }

  private logInput(input:object) {
    console.log('⯇ ' + JSON.stringify(input));
  }
}
