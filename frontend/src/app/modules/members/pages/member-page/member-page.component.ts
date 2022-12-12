import { Component, OnInit } from '@angular/core';
import {switchMap, tap} from "rxjs/operators";
import {HttpService} from "../../../../services/http.service";
import {IMember} from "../../../../model/app-model";
import {of} from "rxjs";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {ActivatedRoute} from "@angular/router";

@UntilDestroy()
@Component({
  selector: 'app-member-page',
  templateUrl: './member-page.component.html',
  styleUrls: ['./member-page.component.scss']
})
export class MemberPageComponent implements OnInit {

  constructor(
    public httpService: HttpService,
    public activatedRoute: ActivatedRoute
  ) { }

  isLoading = true;
  nick?: string;
  member?: IMember;

  ngOnInit(): void {
    this.isLoading = true;
    of({}).pipe(
      switchMap(() => this.activatedRoute.url),
      switchMap((urlSegments) => {
        this.nick = urlSegments[0].path;
        return this.httpService.getMembers$(this.nick);
      }),
      tap((result) => {
        this.isLoading = false;
        const members = (result || []) as IMember[];
        if (members.length) {
          this.member = members[0];
        }
      }),
      untilDestroyed(this)
    ).subscribe();
  }

}
