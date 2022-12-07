import {Component, HostListener, OnInit} from '@angular/core';
import {AppService} from "../../services/app.service";
import {ActivatedRoute} from "@angular/router";
import {Observable, of} from "rxjs";
import {switchMap, tap} from "rxjs/operators";
import {EMPTY_CHANNEL, IChannel} from "../../model/app-model";
import {Channel} from "../../model/messages/channel.model";
import {Thread} from "../../model/messages/thread.model";
import {ChannelService} from "../../services/channel.service";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {HttpService} from "../../services/http.service";

@UntilDestroy()
@Component({
  selector: 'app-channel-page',
  templateUrl: './channel-page.component.html',
  styleUrls: ['./channel-page.component.scss']
})
export class ChannelPageComponent implements OnInit {

  constructor(
    public appService: AppService,
    public httpService: HttpService,
    public activatedRoute: ActivatedRoute,
    public channelService: ChannelService
  ) { }

  readonly defaultChannelId = 1;
  channel: IChannel = EMPTY_CHANNEL;
  channelModel?: Channel;
  isExpanding?: Thread;
  hereAndNowUsers: string[] = [];
  currentPage = 0;

  ngOnInit(): void {
    of({}).pipe(
      switchMap(() => this.activatedRoute.url),
      tap((urlSegments) => {
        this.currentPage = 0;
        let channelId: number;
        if (urlSegments.length) {
          channelId = parseInt(urlSegments[0].path, 10) ?? this.defaultChannelId;
        } else {
          channelId = this.defaultChannelId;
        }
        const channel = this.channelService.channels.find((channel) => channel.id_place === channelId);
        this.channel = channel ?? EMPTY_CHANNEL;
        this.channelService.unselectMessage();
      }),
      tap(() => {
        if (this.channel !== EMPTY_CHANNEL) {
          this.channelModel = this.channelService.getChannel(this.channel.id_place, this.channel?.time_viewed ?? '', this.currentPage);
        }
      }),
      untilDestroyed(this)
    ).subscribe();

    this.channelService.channelInvalidSignal.pipe(
      tap((channelId) => {
        if (this.channel && this.channel.id_place === channelId) {
          this.onChannelInvalidated();
        }
      }),
      untilDestroyed(this)
    ).subscribe();

    this.getHereAndNow$().subscribe();
  }

  get pagesToShow(): number[] {
    const result: number[] = [];
    const count = this.channelModel?.pagesCount ?? 0;
    for (let i = 0; i < count; i++) {
      result.push(i);
    }
    return result;
  }
  get pagesNoAll(): boolean {
    return false;
  }

  getHereAndNow$(): Observable<any> {
    return this.httpService.getHereAndNow$().pipe(
      tap((users) => this.hereAndNowUsers = users)
    );
  }

  onExpandClick(event: any, thread: Thread) {
    event.preventDefault();

    if (!this.isExpanding) {
      if (thread.isLoaded) {
        thread.isExpanded = true;
      } else {
        this.isExpanding = thread;
        of({}).pipe(
          switchMap(() => this.appService.getThread$(thread.rootMessageId, this.channel.time_viewed)),
          tap((input: any) => {
            thread.addMessages(input.messages);
            thread.isExpanded = true;
            delete this.isExpanding;
          }),
          untilDestroyed(this)
        ).subscribe();
      }
    }
  }

  onNewMessageCreated(): void {
    this.channelService.invalidateChannel(this.channel.id_place);
  }

  onChannelInvalidated(): void {
    this.channelModel = this.channelService.getChannel(this.channel.id_place, this.channel?.time_viewed ?? '', this.currentPage);
  }

  @HostListener('document:mousedown', ['$event'])
  onGlobalClick(event: any): void {
    // Клик за пределами сообщений = развыделение сообщения
    let messageElementFound = false;
    let element = event.target;
    for (let i = 0; i < 100; i++) {
      if (element) {
        const classes: string[] = Array.from(element.classList);
        // TODO: Пиздец. Это конечно надо менять. ngIf'ы ломают иерархию, хер поймёшь куда пришёлся тык.
        if (element.localName === 'attachmants' || element.localName === 'button' || classes.some((cls) => cls === 'message__selected')) {
          messageElementFound = true;
          break;
        }
        element = element.parentElement;
      } else {
        break;
      }
    }
    if (!messageElementFound) {
      this.channelService.unselectMessage();
    }
  }

  onMenuItemClick(channel:IChannel): void {
    // Сообщения канала обновим только если ткнули в ссылку самого канала
    const refreshMessages = this.channel && channel.id_place === this.channel.id_place;
    this.refreshEverything(refreshMessages);
  }

  // TODO: Потом выкинуть, когда сервер начнёт присылать инфу о том что нового появилось
  refreshEverything(refreshMessages = false): void {
    of({}).pipe(
      switchMap(() => this.channelService.loadChannels$()),
      switchMap(() => this.getHereAndNow$()),
      tap(() => {
        if (refreshMessages) {
          this.onChannelInvalidated();
        }
      }),
    ).subscribe();
  }

  onPagination(event: any, page: number): void {
    event.preventDefault();
    this.currentPage = page;
    this.onChannelInvalidated();
    window.scroll({ top: 0, left: 0 });
  }

}
