import { Injectable } from '@angular/core';
import {Observable, of} from "rxjs";
import {map, switchMap} from "rxjs/operators";
import {HttpClient} from "@angular/common/http";
import {IFocus, IMailMessage, IMember} from "../model/app-model";
import {IMatrix, serializeMatrix} from "../model/matrix.model";

@Injectable({
  providedIn: 'root'
})
export class HttpService {

  constructor(
    private httpClient: HttpClient,
  ) { }

  static readonly apiPath = '/api';

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

  getChannelsList$(): Observable<any> {
    return of({}).pipe(
      switchMap(() => {
        return this.httpClient.post(
          `${HttpService.apiPath}/channels-list.php`,
          { },
          { observe: 'body', withCredentials: true }
        );
      })
    );
  }

  getChannel$(channelId:number, lastVieved:string, page = 0, messageId?: number): Observable<any> {
    const body: any = {
      cid: channelId.toString(),
      lv: lastVieved,
      page
    };
    
    if (messageId) {
      body.message_id = messageId;
    }
    
    return this.httpClient.post(
      `${HttpService.apiPath}/channel.php`,
      body,
      { observe: 'body', withCredentials: true }
    )
  }

  createChannel$(name: string, disclaimer: string, ghost: boolean): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/channel-create.php`,
      {
        name,
        disclaimer,
        ghost
      },
      { observe: 'body', withCredentials: true }
    )
  }

  updateChannelChangedTime$(placeId: number): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/channel-set-time-changed.php`,
      {
        placeId
      },
      {observe: 'body', withCredentials: true}
    );
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

  trashMessage(messageId: number): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/message-trash.php`,
      {
        messageId
      },
      {observe: 'body', withCredentials: true}
    );
  }

  kitchenMessage(messageId: number): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/message-kitchen.php`,
      {
        messageId
      },
      {observe: 'body', withCredentials: true}
    );
  }

  deleteMessage(messageId: number): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/message-delete.php`,
      {
        messageId
      },
      {observe: 'body', withCredentials: true}
    );
  }

  youtubizeMessage(messageId: number): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/attachment-youtubize.php`,
      {
        messageId
      },
      {observe: 'body', withCredentials: true}
    );
  }

  s3MigrationAttachment(attachmentId: string): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/attachment-post-s3.php`,
      {
        attachmentId
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

  getMailNotification$(): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/mail-notification.php`,
      { },
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

  sendMail$(nick: string, message: string): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/mail-write.php`,
      {
        nick,
        message
      },
      {observe: 'body', withCredentials: true}
    );
  }

  matrixWrite$(idPlace: number, matrix: IMatrix): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/matrix-write.php`,
      {
        placeId: idPlace,
        matrix: serializeMatrix(matrix)
      },
      {observe: 'body', withCredentials: true}
    );
  }

  setSuperstar$(value: number): Observable<any> {
    return this.httpClient.post(
      `${HttpService.apiPath}/superstar-set.php`,
      {
        value
      },
      { observe: 'body', withCredentials: true }
    );
  }

}
