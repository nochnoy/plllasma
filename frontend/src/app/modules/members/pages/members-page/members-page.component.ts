import { Component, OnInit } from '@angular/core';
import {UntilDestroy} from "@ngneat/until-destroy";
import {HttpService} from "../../../../services/http.service";
import {tap} from "rxjs/operators";
import {IMember} from "../../../../model/app-model";
import {UserService} from "../../../../services/user.service";

type Tab = 'digest' | 'profile' | 'girls' | 'flexible'| 'byregisterdate' | 'bymessages' | 'byspasibas' | 'all';

@UntilDestroy()
@Component({
  selector: 'app-members-page',
  templateUrl: './members-page.component.html',
  styleUrls: ['./members-page.component.scss']
})
export class MembersPageComponent implements OnInit {

  constructor(
    public httpService: HttpService,
    public userService: UserService
  ) { }

  isLoading = false;
  membersSearching: IMember[] = [];
  membersMail: IMember[] = [];
  membersToday: IMember[] = [];
  membersNotToday: IMember[] = [];
  membersProfile: IMember[] = [];
  membersGirls: IMember[] = [];
  membersFlexible: IMember[] = [];
  membersByMessages: IMember[] = [];
  membersByRegisterDate: IMember[] = [];
  membersBySpasibas: IMember[] = [];
  membersAll: IMember[] = [];
  searchPhrase = '';
  now = '';
  tab: Tab = 'digest';

  ngOnInit(): void {
    this.isLoading = true;
    this.httpService.getMembers$().pipe(
      tap((result) => {
        this.isLoading = false;

        // Вообще все
        this.membersAll = result || [];

        // Те кто был на сайте последние 24 часа
        this.membersToday = this.membersAll.filter((member) => member.today).sort((a, b) => {
          if (a.nick === this.userService.user.nick) {
            return -1;
          } else if (b.nick === this.userService.user.nick) {
            return 1;
          } else {
            if (a.nick > b.nick) {
              return 1;
            } else if (a.nick < b.nick) {
              return -1;
            } else {
              return 0;
            }
          }
        });

        // Активные но не в списке membersToday
        this.membersNotToday = this.membersAll.filter((member) => !member.dead && this.membersToday.indexOf(member) === -1);

        // Те, с которыми у тебя был переписка
        this.membersMail = this.membersAll.filter((member) => {
          return member.inboxSize > 0 && member.nick !== this.userService.user.nick && (!(member.gray || member.dead) || member.inboxStarred );
        });
        this.membersMail.sort((a, b) => {
          if (a.inboxStarred && !b.inboxStarred) {
            return -1;
          } else if (!a.inboxStarred && b.inboxStarred) {
            return 1;
          } else {
            return b.inboxSize - a.inboxSize;
          }
        });

        // С профилем
        this.membersProfile = this.membersAll.filter((member) => member.profile);

        // Девочки
        this.membersGirls = this.membersAll.filter((member) => member.sex === 2);

        // Гибкие
        this.membersFlexible = [];

        // По сообщениям
        this.membersByMessages = this.membersAll.filter(a => a.msgcount).sort((a, b) => b.msgcount - a.msgcount);

        // По спасибам
        this.membersBySpasibas = this.membersAll.filter(a => a.sps).sort((a, b) => b.sps - a.sps);

        // По старости
        this.membersByRegisterDate = [...this.membersAll]
          .filter((member) => !member.dead)
          .sort((a, b) => {
          if (a.time_joined > b.time_joined) {
            return 1;
          } else if (a.time_joined < b.time_joined) {
            return -1;
          } else {
            return 0;
          }
        });

        this.updateMembersToShow();
      })
    ).subscribe();
  }

  updateMembersToShow(): void {
    if (this.searchPhrase) {
      this.membersSearching = this.membersAll.filter((member) => member.nick.toUpperCase().indexOf(this.searchPhrase.toUpperCase()) > -1);
    } else {
      this.membersSearching = [];
    }
  }

  onFilter(): void {
    this.updateMembersToShow();
  }

  onSearchClearClick(event: any): void {
    event.preventDefault();
    this.searchPhrase = '';
  }

  onTabClick(event: any, newTab: Tab): void {
    event.preventDefault();
    this.tab = newTab;
  }
}


