import {Component, HostListener, Inject, OnInit} from '@angular/core';
import {AppService} from "../../services/app.service";
import {ActivatedRoute} from "@angular/router";
import {Observable, of} from "rxjs";
import {switchMap, tap} from "rxjs/operators";
import {EMPTY_CHANNEL, IMenuChannel} from "../../model/app-model";
import {Channel} from "../../model/messages/channel.model";
import {Thread} from "../../model/messages/thread.model";
import {ChannelService} from "../../services/channel.service";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {HttpService} from "../../services/http.service";
import {MAT_DIALOG_DATA, MatDialog} from "@angular/material/dialog";
import {IMatrix, newDefaultMatrix} from "../../model/matrix.model";
import {UserService} from "../../services/user.service";
import {Const} from "../../model/const";

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
    public channelService: ChannelService,
    public dialog: MatDialog,
    public userService: UserService,
  ) { }

  channelId = 0;
  channel?: Channel;
  isSpinner = false;
  isExpanding?: Thread;
  isNotificationsReady = false;
  hereAndNowUsers: string[] = [];
  mailNotification: any = {};
  currentPage = 0;

  isHalloween = false;
  currentYear = 0;

  ngOnInit(): void {
    of({}).pipe(
      switchMap(() => this.activatedRoute.url),
      switchMap((urlSegments) => {
        this.isNotificationsReady = false;
        this.currentPage = 0;
        this.channelService.deselectMessage();

        if (urlSegments.length) {
          this.channelId = parseInt(urlSegments[0].path, 10) ?? Const.defaultChannelId;
        } else {
          this.channelId = Const.defaultChannelId;
        }

        // Если в других каналах хранилась обновлённая time_changed - настало им её применить т.к. мы ушли с тех каналов
        this.channelService.applyDeferredMenuTimes(this.channelId);

        // Пока грузится настоящий канал, покажем юзеру сохранённую копию или заглушку
        this.channel = this.channelService.channelsCache.find((c) => c.id === this.channelId) ?? this.createChannelStub(this.channelId);

        // Получаем канал
        return this.channelService.getChannel(
          this.channelId,
          this.channelService.menuChannels.find((mc) => mc.id_place === this.channelId)?.time_viewed ?? '',
          this.currentPage
        );
      }),
      tap((channel: Channel) => {
        this.channel = channel;
        this.channel.roleTitle = this.userService.getRoleTitle(this.channelId);
        this.channel.canAccess = this.userService.canAccess(this.channelId);
        this.channel.canModerate = this.userService.canAccess(this.channelId);
        this.channel.canEditMatrix = this.userService.canEditMatrix(this.channelId);
        this.channel.canUseSettings = this.userService.canUseChannelSettings(this.channelId);

        // Сохраним канал в кеше чтоб быстро открывать
        this.channelService.channelsCache = this.channelService.channelsCache.filter((c) => c.id !== this.channelId);
        this.channelService.channelsCache.push(this.channel);

        this.checkHalloween();
      }),
      untilDestroyed(this)
    ).subscribe();

    this.channelService.channelInvalidSignal.pipe(
      tap((channelId) => {
        if (this.channel?.id === channelId) {
          this.onChannelInvalidated();
        }
      }),
      untilDestroyed(this)
    ).subscribe();

    this.getHereAndNow$().subscribe();
  }

  get pagesToShow(): number[] {
    const result: number[] = [];
    const count = this.channel?.pagesCount ?? 0;
    for (let i = 0; i < count; i++) {
      result.push(i);
    }
    return result;
  }
  get pagesNoAll(): boolean {
    return false;
  }

  getHereAndNow$(): Observable<any> {
    this.isNotificationsReady = false;
    return of({}).pipe(
      switchMap(() => this.httpService.getHereAndNow$()),
      tap((users) => this.hereAndNowUsers = users),
      switchMap(() => this.httpService.getMailNotification$()),
      tap((mailNotification) => this.mailNotification = mailNotification),
      tap(() => this.isNotificationsReady = true)
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
          switchMap(() => this.appService.getThread$(thread.rootMessageId, this.channel?.timeViewed ?? '')),
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
    this.channelService.invalidateChannel(this.channelId);
  }

  onChannelInvalidated(): void {
    this.channelService.getChannel(
      this.channelId,
      this.channelService.menuChannels.find((mc) => mc.id_place === this.channelId)?.time_viewed ?? '',
      this.currentPage
    ).pipe(
      tap((result) => this.channel = result),
      untilDestroyed(this),
    ).subscribe();
  }

  @HostListener('document:mousedown', ['$event'])
  onGlobalClick(event: any): void {
    if (this.channelService.selectedMessage) {
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
        this.channelService.deselectMessage();
      }
    }
  }

  onMenuItemClick(channel: IMenuChannel): void {
    const refreshMessages = channel.id_place === this.channelId;
    of({}).pipe(
      switchMap(() => this.channelService.loadChannels$()),
      switchMap(() => this.getHereAndNow$()),
      tap(() => {
        if (refreshMessages) { // Сообщения канала обновим только если ткнули в ссылку самого канала
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

  onMatrixChanged(matrix: IMatrix): void {
    if (this.channel?.canEditMatrix) {
      if (this.channel?.matrix) {
        this.isSpinner = true;
        this.httpService.matrixWrite$(this.channelId, matrix).pipe(
          tap((result) => {
            this.isSpinner = false;
          }),
        ).subscribe();
      }
    }
  }

  openDialog() {
    this.dialog.open(DialogDataExampleDialog, {
      data: {
        animal: 'panda'
      }
    });
  }

  checkHalloween(): void {
    if (this.channelId === 1) {
      const year = (new Date()).getFullYear();
      const now = new Date();
      const from = new Date(year, 10 - 1, 11);
      const to = new Date(year, 11 - 1, 6);
      this.isHalloween = (now.getTime() >= from.getTime() && now.getTime() <= to.getTime());
      this.currentYear = year;
    } else {
      this.isHalloween = false;
    }
  }

  createChannelStub(channelId: number): Channel {
    const channel = new Channel();
    channel.id = channelId;
    channel.name = this.channelService.menuChannels.find((mc) => mc.id_place === this.channelId)?.name ?? 'xxx';
    channel.matrix = newDefaultMatrix(channel.name);
    channel.canAccess = true;
    return channel;
  }

  subscribeCommand(): void {
    this.appService.subscribeChannel$(this.channelId).pipe(
      untilDestroyed(this)
    ).subscribe();
  }

  ubsubscribeCommand(): void {
    this.appService.unsubscribeChannel$(this.channelId).pipe(
      untilDestroyed(this)
    ).subscribe();
  }

}

export interface DialogData {
  animal: 'panda' | 'unicorn' | 'lion';
}

@Component({
  selector: 'dialog-data-example-dialog',
  templateUrl: 'dialog-data-example-dialog.html',
})
export class DialogDataExampleDialog {
  constructor(@Inject(MAT_DIALOG_DATA) public data: DialogData) {}
}
