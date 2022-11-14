import { Component, OnInit } from '@angular/core';
import {AppService} from "../../services/app.service";
import {ActivatedRoute} from "@angular/router";
import {Observable, of} from "rxjs";
import {switchMap, tap} from "rxjs/operators";
import {EMPTY_CHANNEL, IChannel} from "../../model/app-model";
import {Channel} from "../../model/messages/channel.model";
import {Thread} from "../../model/messages/thread.model";
import {ChannelService} from "../../services/channel.service";

@Component({
  selector: 'app-channel-page',
  templateUrl: './channel-page.component.html',
  styleUrls: ['./channel-page.component.scss']
})
export class ChannelPageComponent implements OnInit {

  constructor(
    public appService: AppService,
    public activatedRoute: ActivatedRoute,
    public channelService: ChannelService
  ) { }

  readonly defaultChannelId = 1;
  channel: IChannel = EMPTY_CHANNEL;
  channelModel?: Channel;

  ngOnInit(): void {
    of({}).pipe(
      switchMap(() => this.activatedRoute.url),
      tap((urlSegments) => {
        let channelId: number;
        if (urlSegments.length) {
          channelId = parseInt(urlSegments[0].path, 10) ?? this.defaultChannelId;
        } else {
          channelId = this.defaultChannelId;
        }
        const channel = this.channelService.channels.find((channel) => channel.id_place === channelId);
        this.channel = channel ?? EMPTY_CHANNEL;
      }),
      tap(() => {
        if (this.channel !== EMPTY_CHANNEL) {
          this.channelModel = this.channelService.getChannel(this.channel.id_place, this.channel?.time_viewed ?? '');
        }
      }),
    ).subscribe();
  }

  onExpandClick(event: any, thread: Thread) {
    event.preventDefault();

    if (thread.isLoaded) {
      thread.isExpanded = true;
    } else {
      of({}).pipe(
        switchMap(() => this.appService.getThread$(thread.rootMessageId, this.channel.time_viewed)),
        tap((input: any) => {
          thread.addMessages(input.messages);
          thread.isExpanded = true;
        })
      ).subscribe();
    }
  }

  onNewMessageCreated(): void {
    this.channelModel = this.channelService.getChannel(this.channel.id_place, this.channel?.time_viewed ?? '');
  }

}
