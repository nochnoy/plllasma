import { Component, OnInit } from '@angular/core';
import { UserService } from 'src/app/services/user.service';
import {HttpService} from "../../../../services/http.service";
import {IMenuChannel} from "../../../../model/app-model";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {tap} from "rxjs/operators";

@UntilDestroy()
@Component({
  selector: 'app-channels-page',
  templateUrl: './channels-page.component.html',
  styleUrls: ['./channels-page.component.scss']
})
export class ChannelsPageComponent implements OnInit {

  constructor(
    public httpService: HttpService,
  ) { }

  isLoading = false;
  searchPhrase = '';

  channelsSearching: IMenuChannel[] = [];
  channelsAll: IMenuChannel[] = [];

  ngOnInit(): void {
    this.isLoading = true;
    this.httpService.getChannelsList$().pipe(
      tap((result) => {
        this.isLoading = false;

        // Вообще все
        this.channelsAll = result || [];
        this.channelsAll = this.channelsAll.sort((a, b) => {
          if (a.time_changed < b.time_changed) {
            return 1;
          } else if (a.time_changed > b.time_changed) {
            return -1;
          } else {
            return 0;
          }          
        });

        this.updateMembersToShow();
      }),
      untilDestroyed(this)
    ).subscribe();
  }

  updateMembersToShow(): void {
    if (this.searchPhrase) {
      this.channelsSearching = this.channelsAll.filter((channel) => (channel.name ?? '').toUpperCase().indexOf(this.searchPhrase.toUpperCase()) > -1);
    } else {
      this.channelsSearching = [];
    }
  }

  onFilter(): void {
    this.updateMembersToShow();
  }

  onSearchClearClick(event: any): void {
    event.preventDefault();
    this.searchPhrase = '';
  }

}
