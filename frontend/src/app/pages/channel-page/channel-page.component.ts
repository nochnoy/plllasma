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
      switchMap(() => {
        if (this.channel !== EMPTY_CHANNEL) {
          return this.load$(this.channel.id_place);
        } else {
          return of({});
        }
      }),
    ).subscribe();
  }

  load$(channelId: number): Observable<any> {
    return of({}).pipe(
      switchMap(() => this.appService.getChannel$(channelId, this.channel?.time_viewed ?? '')),
      tap((input) => {
        if (input.error) {
          console.error(`Сервер вернул ошибку ${input.error}`);
        } else {
          this.channelModel = new Channel();
          this.channelModel.deserialize(input);

          // Канал который был выбран до этого, актуализируют свою time_viewed и лишается звёздочки
          this.channelService.channels
            .filter((channel) => channel.id_place !== channelId)
            .forEach((channel) => {
              if (channel.time_viewed_deferred) {
                channel.time_viewed = channel.time_viewed_deferred;
                delete channel.time_viewed_deferred;
              }
            });

          // Выбранный канал сохраняет time_viewed до момента когда мы с него уйдём
          const channelAtMenu = this.channelService.channels.find((channel) => channel.id_place === channelId);
          if (channelAtMenu) {
            channelAtMenu.time_viewed_deferred = input.viewed;
          }
        }
      })
    );
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
    this.load$(this.channel?.id_place ?? 0).subscribe();
  }

}
