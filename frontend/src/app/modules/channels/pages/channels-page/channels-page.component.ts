import { Component, OnInit } from '@angular/core';
import { UserService } from 'src/app/services/user.service';
import {HttpService} from "../../../../services/http.service";
import {IMenuChannel, RoleEnum} from "../../../../model/app-model";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {tap} from "rxjs/operators";
import { Const } from 'src/app/model/const';
import {Router} from "@angular/router";

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
  ) { }

  isLoading = false;
  searchPhrase = '';
  channelsSearching: IMenuChannel[] = [];
  channelsAll: IMenuChannel[] = [];
  isHalloween = false;
  currentYear = 0;

  ngOnInit(): void {
    this.load();
    this.checkHalloween();
  }

  load(): void {
    this.isLoading = true;
    this.httpService.getChannelsList$().pipe(
      tap((result) => {
        this.isLoading = false;

        // Сократим
        (result || []).forEach((channel: any) => channel.shortName = channel.name.substr(0, Const.channelShornNameLength));

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

        this.updateChannelsToShow();
        this.updateSuperstar(result || []);
      }),
      untilDestroyed(this)
    ).subscribe();
  }

  updateChannelsToShow(): void {
    if (this.searchPhrase) {
      this.channelsSearching = this.channelsAll.filter((channel) => (channel.name ?? '').toUpperCase().indexOf(this.searchPhrase.toUpperCase()) > -1);
    } else {
      this.channelsSearching = [];
    }
  }

  isChannelAffectingSuperstar(channel: IMenuChannel): boolean {
    return channel.time_changed > channel.time_viewed && channel.at_menu !== 't' && (!!channel.role && channel.role !== RoleEnum.nobody);
  }

  updateSuperstar(channels: IMenuChannel[]): void {
    let newSuperstar = 0;
    channels.forEach((channel) => {
      if (this.isChannelAffectingSuperstar(channel)) {
        newSuperstar++;
      }
    });
    if (this.userService.user.superstar !== newSuperstar) {
      this.userService.user.superstar = newSuperstar;
      this.httpService.setSuperstar$(newSuperstar).pipe(
        untilDestroyed(this)
      ).subscribe();
    }
  }

  onFilter(): void {
    this.updateChannelsToShow();
  }

  checkHalloween(): void {
    const year = (new Date()).getFullYear();
    const now = new Date();
    const from = new Date(year, 10 - 1, 11);
    const to = new Date(year, 11 - 1, 6);
    this.isHalloween = (now.getTime() >= from.getTime() && now.getTime() <= to.getTime());
    this.currentYear = year;
  }

  onChannelClick(channel: IMenuChannel): void {
    if (this.isChannelAffectingSuperstar(channel)) {
      let newSuperstar = this.userService.user.superstar || 0;
      newSuperstar--;
      if (newSuperstar < 0) {
        newSuperstar = 0;
      }
      if (this.userService.user.superstar !== newSuperstar) {
        this.userService.user.superstar = newSuperstar;

        // Без untilDestroyed т.к. должен отработать после того как мы уйдём со страницы!
        this.httpService.setSuperstar$(newSuperstar).subscribe();
      }
    }
  }
}


