import { Component, OnInit } from '@angular/core';
import { UserService } from 'src/app/services/user.service';
import {HttpService} from "../../../../services/http.service";
import {IChannelLink} from "../../../../model/app-model";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {tap} from "rxjs/operators";
import {Router} from "@angular/router";
import {ChannelService} from "../../../../services/channel.service";
import {HolidayService} from "../../../../services/holiday.service";

@UntilDestroy()
@Component({
  selector: 'app-channels-page',
  templateUrl: './channels-page.component.html',
  styleUrls: ['./channels-page.component.scss']
})
export class ChannelsPageComponent implements OnInit {

  constructor(
    public httpService: HttpService,
    public userService: UserService,
    public router: Router,
    public channelService: ChannelService,
    public holiday: HolidayService,
  ) { }

  isLoading = false;
  searchPhrase = '';
  hereAndNowUsers: string[] = [];

  channelsAll: IChannelLink[] = [];

  ngOnInit(): void {
    this.clearSuperstar();
    this.load();
    this.getHereAndNow();
  }

  load(): void {
    this.isLoading = true;
    this.httpService.getChannelsList$().pipe(
      tap((result) => {
        this.isLoading = false;

        // Вообще все. Сортировку, сокращение имён и разбивку по разделам делает channels-list
        this.channelsAll = result || [];
      }),
      untilDestroyed(this)
    ).subscribe();
  }

  onFilter(): void {
    this.searchPhrase = this.searchPhrase.trim();
  }

  // Суперзвезда гаснет при заходе на страницу каталога:
  // юзер увидел список обновившихся каналов - счётчик своё дело сделал
  clearSuperstar(): void {
    if (this.userService.user.superstar) {
      this.userService.user.superstar = 0;
      this.httpService.setSuperstar$(0).pipe(
        untilDestroyed(this)
      ).subscribe();
    }
  }

  getHereAndNow(): void {
    this.httpService.getHereAndNow$().pipe(
      tap((users) => this.hereAndNowUsers = users),
      untilDestroyed(this)
    ).subscribe();
  }
}


