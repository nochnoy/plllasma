import { Component, OnInit } from '@angular/core';
import {UntilDestroy} from "@ngneat/until-destroy";
import {HttpService} from "../../../../services/http.service";
import {tap} from "rxjs/operators";

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

  ngOnInit(): void {
    this.isLoading = true;
    this.httpService.getMembers$('DM_NG').pipe(
      tap((result) => {
        this.isLoading = false;

        const dmng = result.find((user) => user.nick === 'DM_NG');
        console.log(dmng);


      })
    ).subscribe();
  }

}
