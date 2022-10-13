import { Component, OnInit } from '@angular/core';
import {AppService} from "../../services/app.service";
import {ActivatedRoute} from "@angular/router";
import {Observable, of} from "rxjs";
import {switchMap, tap} from "rxjs/operators";
import {IChannel} from "../../model/app-model";
import {Channel} from "../../model/messages/channel.model";
import {Thread} from "../../model/messages/thread.model";

@Component({
  selector: 'app-channel-page',
  templateUrl: './channel-page.component.html',
  styleUrls: ['./channel-page.component.scss']
})
export class ChannelPageComponent implements OnInit {

  constructor(
    public appService: AppService,
    public activatedRoute: ActivatedRoute,
  ) { }

  readonly defaultChannelId = 1;
  channel?: IChannel;
  channelModel?: Channel;

  ngOnInit(): void {
    let id = this.defaultChannelId;
    of({}).pipe(
      switchMap(() => this.activatedRoute.url),
      tap((urlSegments) => {
        if (urlSegments.length) {
          id = parseInt(urlSegments[0].path, 10) ?? this.defaultChannelId;
        }
        this.channel = this.appService.channels.find((channel) => channel.id_place === id);
      }),
      switchMap(() => this.load$(id)),
    ).subscribe();
  }

  load$(channelId: number): Observable<any> {
    return of({}).pipe(
      switchMap(() => this.appService.getChannel(channelId, "2019-09-22 22:21:06")),
      tap((input) => {
        this.channelModel = new Channel();
        this.channelModel.deserialize(input);
      })
    );
  }

  onExpandClick(event: any, thread: Thread) {
    event.preventDefault();

    if (thread.isLoaded) {
      thread.isExpanded = true;
    } else {
      of({}).pipe(
        switchMap(() => this.appService.getThread(thread.rootId, "2019-09-22 22:21:06")),
        tap((input: any) => {
          thread.addMessages(input.messages);
          thread.isExpanded = true;
        })
      ).subscribe();
    }
  }

  onNewMessagePosted(message: string): void {
    if (this.channel !== undefined) {
      this.appService.addMessage$(this.channel?.id_place, message).pipe(
        switchMap(() => this.load$(this.channel?.id_place ?? 0)),
      ).subscribe();
    }
  }

}
