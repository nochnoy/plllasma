import { Component, OnInit } from '@angular/core';
import {switchMap, tap} from "rxjs/operators";
import {HttpService} from "../../../../services/http.service";
import {IMailMessage, IMember} from "../../../../model/app-model";
import {of} from "rxjs";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {ActivatedRoute} from "@angular/router";
import {AppService} from "../../../../services/app.service";
import {UserService} from "../../../../services/user.service";
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
    public activatedRoute: ActivatedRoute
  ) { }

  isLoading = true;
  nick?: string;
  member?: IMember;
  years = '';
  spasibas = '';
  messages = '';
  sex = '';
  visits = '';

  mail: IMailMessage[] = [];
  mailMessage: string = '';
  isSending = false;

  ngOnInit(): void {
    this.isLoading = true;
    of({}).pipe(
      switchMap(() => this.activatedRoute.url),
      switchMap((urlSegments) => {
        this.nick = urlSegments[0].path;
        return this.httpService.getMembers$(this.nick);
      }),
      switchMap((result) => {
        this.isLoading = false;
        const members = (result || []) as IMember[];
        if (members.length) {
          this.member = members[0];
        }

        if (this.member) {

          this.spasibas = this.member.sps + ' ' + Utils.chisl(this.member.sps, ['спасибу', 'спасибы', 'спасиб']);

          this.messages = this.member.msgcount + ' ' + Utils.chisl(this.member.msgcount, ['сообщения', 'сообщений', 'сообщений']);

          this.sex = this.member.sex === 0 ? 'Не женат' : 'Замужем';

          this.visits = `Здесь было ${this.member.profile_visits} ${Utils.chisl(this.member.profile_visits, ['человек', 'человека', 'человек'])}`;

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
        if (this.nick !== this.userService.user.nick) {
          return of({}).pipe(
            switchMap(() => this.httpService.getMail$(this.nick!)),
            tap((result) => {

              this.mail = result;

            }),
          );
        } else {
          return of({});
        }
      }),
      untilDestroyed(this)
    ).subscribe();
  }

  onSsendMessageClick(): void {
    if (this.mailMessage) {
      this.isSending = true;
      this.httpService.sendMail$(this.nick!, this.mailMessage).pipe(
        tap(() => {
          this.isSending = false;
          this.mailMessage = '';
        })
      ).subscribe();
    }
  }

}
