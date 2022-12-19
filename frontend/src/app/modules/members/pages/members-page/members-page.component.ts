import { Component, OnInit } from '@angular/core';
import {UntilDestroy} from "@ngneat/until-destroy";
import {HttpService} from "../../../../services/http.service";
import {tap} from "rxjs/operators";
import {IMember} from "../../../../model/app-model";
import {UserService} from "../../../../services/user.service";

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
  allMmembers: IMember[] = [];
  membersToShow: IMember[] = [];
  membersToday: IMember[] = [];
  correspondents: IMember[] = [];
  searchPhrase = '';
  now = '';

  ngOnInit(): void {
    this.isLoading = true;
    this.httpService.getMembers$().pipe(
      tap((result) => {
        this.isLoading = false;

        this.allMmembers = result || [];

        this.membersToday = this.allMmembers.filter((member) => {
          return member.time_logged;
        })

          this.correspondents = this.allMmembers.filter((member) => {
          return member.inboxSize > 0 && member.nick !== this.userService.user.nick && (!(member.gray || member.dead) || member.inboxStarred );
        });
        this.correspondents.sort((a, b) => {
          if (a.inboxStarred && !b.inboxStarred) {
            return -1;
          } else if (!a.inboxStarred && b.inboxStarred) {
            return 1;
          } else {
            return b.inboxSize - a.inboxSize;
          }
        });

        this.updateMembersToShow();
      })
    ).subscribe();
  }

  updateMembersToShow(): void {
    if (this.searchPhrase) {
      this.membersToShow = this.allMmembers.filter((member) => member.nick.toUpperCase().indexOf(this.searchPhrase.toUpperCase()) > -1);
    } else {
      this.membersToShow = this.allMmembers;
    }
  }

  onFilter(): void {
    this.updateMembersToShow();
  }
}


