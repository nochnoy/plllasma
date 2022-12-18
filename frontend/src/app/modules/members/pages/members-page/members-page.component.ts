import { Component, OnInit } from '@angular/core';
import {UntilDestroy} from "@ngneat/until-destroy";
import {HttpService} from "../../../../services/http.service";
import {tap} from "rxjs/operators";
import {IMember} from "../../../../model/app-model";

@UntilDestroy()
@Component({
  selector: 'app-members-page',
  templateUrl: './members-page.component.html',
  styleUrls: ['./members-page.component.scss']
})
export class MembersPageComponent implements OnInit {

  constructor(
    public httpService: HttpService
  ) { }

  isLoading = false;
  allMmembers: IMember[] = [];
  membersToShow: IMember[] = [];
  searchPhrase = '';

  ngOnInit(): void {
    this.isLoading = true;
    this.httpService.getMembers$().pipe(
      tap((result) => {
        this.isLoading = false;
        this.allMmembers = result || [];
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


