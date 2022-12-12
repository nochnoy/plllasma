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
  members: IMember[] = [];

  ngOnInit(): void {
    this.isLoading = true;
    this.httpService.getMembers$().pipe(
      tap((result) => {
        this.isLoading = false;
        this.members = result || [];
      })
    ).subscribe();
  }

}
