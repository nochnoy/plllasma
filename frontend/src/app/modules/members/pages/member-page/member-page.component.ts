import { Component, OnInit } from '@angular/core';
import {switchMap, tap} from "rxjs/operators";
import {HttpService} from "../../../../services/http.service";
import {IMailMessage, IMember, IIgnoreRelation} from "../../../../model/app-model";
import {of} from "rxjs";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {ActivatedRoute, Router} from "@angular/router";
import {AppService} from "../../../../services/app.service";
import {UserService} from "../../../../services/user.service";
import {ChannelService} from "../../../../services/channel.service";
import {Utils} from "../../../../utils/utils";

@UntilDestroy()
@Component({
  selector: 'app-member-page',
  templateUrl: './member-page.component.html',
  styleUrls: ['./member-page.component.scss']
})
export class MemberPageComponent implements OnInit {

  constructor(
    public userService: UserService,
    public httpService: HttpService,
    public appService: AppService,
    public channelService: ChannelService,
    public activatedRoute: ActivatedRoute,
    private router: Router
  ) { }

  isLoading = true;
  isMailLoading = false;
  isMe = false;
  nick?: string;
  member?: IMember;
  ignore?: IIgnoreRelation;
  years = '';
  spasibas = '';
  messages = '';
  sex = '';
  visits = '';

  mail: IMailMessage[] = [];
  mailMessage: string = '';
  isSending = false;
  isGoingToWrite = false;

  ngOnInit(): void {
    this.isLoading = true;
    of({}).pipe(
      switchMap(() => this.activatedRoute.url),
      switchMap((urlSegments) => {
        this.nick = urlSegments[0].path;

        if (this.nick === 'Привидение') {
          this.router.navigate(['/info/ghost']);
          return of({users: [] as IMember[], ignore: undefined});
        }

        this.isMe = this.nick === this.userService.user.nick;
        return this.httpService.getMembers$(this.nick);
      }),
      switchMap((result) => {
        this.isLoading = false;
        const members = (result?.users || []) as IMember[];
        if (members.length) {
          this.member = members[0];
        }
        this.ignore = result?.ignore;

        if (this.member) {
          this.spasibas = this.member.sps + ' ' + Utils.chisl(this.member.sps, ['спасибу', 'спасибы', 'спасиб']);
          this.messages = this.member.msgcount + ' ' + Utils.chisl(this.member.msgcount, ['сообщения', 'сообщений', 'сообщений']);
          this.sex = this.member.sex === 0 ? 'Не женат' : 'Замужем';
          this.visits = `Здесь было ${this.member.profile_visits} ${Utils.chisl(this.member.profile_visits, ['человек', 'человека', 'человек'])}.`;
          const registered = new Date(this.member?.time_joined ?? 0);
          if (registered instanceof Date && !isNaN(registered.getTime())) {
            const years = (new Date()).getFullYear() - registered.getFullYear();
            this.years = years + ' ' + Utils.chisl(years, ['год', 'года', 'лет']);
          }
        }

        // Если это не мой профайл - увеличим счётчик просмотров
        if (this.nick !== this.userService.user.nick) {
          return this.httpService.incrementMemberVisits$(this.nick!);
        } else {
          return of({});
        }
      }),
      switchMap(() => {
        if (this.isMe) {
          this.mail = [];
          return of({});
        } else {
          return of({}).pipe(
            switchMap(() => {
              this.isMailLoading = true;
              return this.httpService.getMail$(this.nick!);
            }),
            tap((result) => {
              this.isMailLoading = false;
              this.mail = result;
            }),
          );
        }
      }),
      untilDestroyed(this)
    ).subscribe();
  }

  onSendMessageClick(): void {
    if (this.mailMessage) {
      this.isSending = true;
      this.httpService.sendMail$(this.nick!, this.mailMessage).pipe(
        tap((result) => {
          if (result.ok) {
            this.mail.unshift({
              nick: this.userService.user.nick,
              unread: true,
              time_created: (new Date()).toISOString(),
              message: this.mailMessage
            });
          }
          this.mailMessage = '';
          this.isSending = false;
        }),
      ).subscribe();
    }
  }

  onOpenFormClick(event: any): void {
    event.preventDefault();
    this.isGoingToWrite = true;
  }

  ignoreCommand(event: any): void {
    event.preventDefault();
    if (!this.ignore) {
      return;
    }
    this.appService.ignoreUser$(this.ignore.uid).pipe(
      tap((result) => {
        if (result.ok && this.ignore) {
          this.ignore.iIgnore = true;
        }
      }),
      switchMap(() => this.channelService.loadChannels$()), // Перечитаем меню - звёздочки пересчитаются
      untilDestroyed(this)
    ).subscribe();
  }

  unignoreCommand(event: any): void {
    event.preventDefault();
    if (!this.ignore) {
      return;
    }
    this.appService.unignoreUser$(this.ignore.uid).pipe(
      tap((result) => {
        if (result.ok && this.ignore) {
          this.ignore.iIgnore = false;
        }
      }),
      switchMap(() => this.channelService.loadChannels$()),
      untilDestroyed(this)
    ).subscribe();
  }

  vanishCommand(event: any): void {
    event.preventDefault();
    if (!this.ignore) {
      return;
    }
    this.appService.vanishUser$(this.ignore.uid).pipe(
      tap((result) => {
        if (result.ok && this.ignore) {
          this.ignore.vanished = true;
          this.ignore.vanishInitiatorMe = true;
          this.ignore.iIgnore = false;
        }
      }),
      switchMap(() => this.channelService.loadChannels$()),
      untilDestroyed(this)
    ).subscribe();
  }

  returnCommand(event: any): void {
    event.preventDefault();
    if (!this.ignore) {
      return;
    }
    this.appService.returnUser$(this.ignore.uid).pipe(
      tap((result) => {
        if (result.ok && this.ignore) {
          this.ignore.vanished = false;
          this.ignore.vanishInitiatorMe = false;
        }
      }),
      switchMap(() => this.channelService.loadChannels$()),
      untilDestroyed(this)
    ).subscribe();
  }

}
