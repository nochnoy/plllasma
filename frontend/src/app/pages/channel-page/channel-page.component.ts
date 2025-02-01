import {Component, HostListener, Inject, OnInit} from '@angular/core';
import {AppService} from "../../services/app.service";
import {ActivatedRoute} from "@angular/router";
import {Observable, of} from "rxjs";
import {catchError, switchMap, tap} from "rxjs/operators";
import {EMPTY_CHANNEL, IChannelLink} from "../../model/app-model";
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
  isExpanding?: Thread;
  isNotificationsReady = false;
  hereAndNowUsers: string[] = [];
  mailNotification: any = {};
  currentPage = 0;
  lv: string = '';

  isHalloween = false;
  isNewYear = false;

  ngOnInit(): void {
    of({}).pipe(
      tap(() => {
        this.checkHollydays();
      }),
      switchMap(() => this.activatedRoute.url),
      switchMap((urlSegments) => {
        this.isNotificationsReady = false;
        this.currentPage = 0;
        this.channelService.deselectMessage();

        if (urlSegments[0]) {
          this.channelId = parseInt(urlSegments[0].path, 10) ?? Const.defaultChannelId;
        } else {
          this.channelId = Const.defaultChannelId;
        }

        // Если в других каналах хранилась обновлённая time_changed - настало им её применить т.к. мы ушли с тех каналов
        this.channelService.applyDeferredMenuTimes(this.channelId);

        // Пока грузится настоящий канал, покажем юзеру заглушку
        this.channel = this.createChannelStub(this.channelId);
        this.channel.isLoading = true;

        // Получаем канал
        return this.channelService.getChannel(
          this.channelId,
          '',
          this.currentPage
        );
      }),
      tap((channel: Channel) => {
        this.channel = channel;
        this.channel.isLoading = false;
        this.lv = channel.viewed ?? '';
        this.onChannelUpdated();
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

  onChannelUpdated(): void {
    if (this.channel) {
      this.channel.roleTitle = this.userService.getRoleTitle(this.channelId);
      this.channel.canAccess = this.userService.canAccess(this.channelId);
      this.channel.canModerate = this.userService.canModerate(this.channelId);
      this.channel.canEditMatrix = this.userService.canEditMatrix(this.channelId);
      this.channel.canUseSettings = this.userService.canUseChannelSettings(this.channelId);
    }
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
          switchMap(() => this.appService.getThread$(thread.rootMessageId, this.lv)),
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
    if (this.channel) {
      this.channel.isLoading = true;
    }
    this.channelService.getChannel(
      this.channelId,
      this.lv,
      this.currentPage
    ).pipe(
      tap((result) => {
        this.channel = result;
        this.channel.isLoading = false;
        this.onChannelUpdated();
      }),
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

  onMenuItemClick(channel: IChannelLink): void {
    const refreshMessages = channel.id_place === this.channelId;
    of({}).pipe(
      switchMap(() => this.channelService.loadChannels$()),
      switchMap(() => this.getHereAndNow$()),
      tap(() => {
        if (refreshMessages) { // Сообщения канала обновим только если ткнули в ссылку самого канала
          this.onChannelInvalidated();
        }
        this.onChannelUpdated();
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
    if (this.channel) {
      if (this.channel.canEditMatrix) {
        if (this.channel.matrix) {
          this.channel.isLoading = true;
          this.httpService.matrixWrite$(this.channelId, matrix).pipe(
            tap(() => {
              if (this.channel) {
                this.channel.isLoading = false;
              }
            }),
          ).subscribe();
        }
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

  checkHollydays(): void {
    const now = new Date();
    const nowMonth = now.getMonth() + 1;
    const nowDate = now.getDate();
    this.isHalloween = (nowMonth === 10 && nowDate >= 15) || (nowMonth === 11 && nowDate <= 6);
    this.isNewYear = (nowMonth === 12 && nowDate >= 15) || (nowMonth === 1 && nowDate <= 10);
  }

  createChannelStub(channelId: number): Channel {
    const channel = new Channel();
    channel.id = channelId;
    channel.name = this.channelService.menuChannels.find((mc) => mc.id_place === this.channelId)?.name ?? '';
    channel.matrix = newDefaultMatrix(channel.name);
    channel.canAccess = true;
    return channel;
  }

  subscribeCommand(): void {
    of({}).pipe(
      switchMap(() => this.appService.subscribeChannel$(this.channelId)),
      tap((result) => {
        if (result.ok && this.channel) {
          this.channel.atMenu = true;
        }
      }),
      switchMap(() => {
        if (this.channel) {
          this.channel.isIgnoring = false;
        }
        return this.appService.unignoreChannel$(this.channelId);
      }),
      switchMap(() => this.channelService.loadChannels$()),
      untilDestroyed(this)
    ).subscribe();
  }

  unsubscribeCommand(): void {
    of({}).pipe(
      switchMap(() => this.appService.unsubscribeChannel$(this.channelId)),
      tap((result) => {
        if (result.ok && this.channel) {
          this.channel.atMenu = false;
        }
      }),
      switchMap(() => this.channelService.loadChannels$()),
      untilDestroyed(this)
    ).subscribe();
  }

  ignoreCommand(): void {
    of({}).pipe(
      switchMap(() => this.appService.ignoreChannel$(this.channelId)),
      tap((result) => {
        if (result.ok && this.channel) {
          this.channel.isIgnoring = true;
        }
      }),
      untilDestroyed(this)
    ).subscribe();
  }

  unignoreCommand(): void {
    of({}).pipe(
      switchMap(() => this.appService.unignoreChannel$(this.channelId)),
      tap((result) => {
        if (result.ok && this.channel) {
          this.channel.isIgnoring = false;
        }
      }),
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
