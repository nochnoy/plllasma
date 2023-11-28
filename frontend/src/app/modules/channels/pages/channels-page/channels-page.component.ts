import { Component, OnInit } from '@angular/core';
import { UserService } from 'src/app/services/user.service';
import {HttpService} from "../../../../services/http.service";
import {IChannelLink, RoleEnum} from "../../../../model/app-model";
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
  isHalloween = false;
  currentYear = 0;

  channelsAll: IChannelLink[] = [];
  channelsActivity: IChannelLink[] = [];
  channelsSearching: IChannelLink[] = [];
  channelsFlex: IChannelLink[] = [];
  channelsFlexDark: IChannelLink[] = [];
  channelsFlexPerformers: IChannelLink[] = [];
  channelsOther: IChannelLink[] = [];
  channelsMen: IChannelLink[] = [];
  channelsAmazonia: IChannelLink[] = [];
  channelsAdmin: IChannelLink[] = [];

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
          if (a.name > b.name) {
            return 1;
          } else if (a.name < b.name) {
            return -1;
          } else {
            return 0;
          }
        });

        // Активность
        this.channelsActivity = [...this.channelsAll].sort((a, b) => {
          if (a.time_changed < b.time_changed) {
            return 1;
          } else if (a.time_changed > b.time_changed) {
            return -1;
          } else {
            return 0;
          }
        }).slice(0, 5);

        // Остальные
        this.channelsOther = this.channelsAll.filter((c) => c.id_section === Const.channelSectionOther);
        this.channelsFlex = this.channelsAll.filter((c) => c.id_section === Const.channelSectionFlex);
        this.channelsFlexDark = this.channelsAll.filter((c) => c.id_section === Const.channelSectionFlexDark);
        this.channelsFlexPerformers = this.channelsAll.filter((c) => c.id_section === Const.channelSectionPerformers);
        this.channelsMen = this.channelsAll.filter((c) => c.id_section === Const.channelSectionMen);
        this.channelsAmazonia = this.channelsAll.filter((c) => c.id_section === Const.channelSectionAmazonia);
        this.channelsAdmin = this.channelsAll.filter((c) => c.id_section === Const.channelSectionAdmin);

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

  isChannelAffectingSuperstar(channel: IChannelLink): boolean {
    return channel.time_changed > channel.time_viewed
      && channel.ignoring === 0
      && channel.at_menu !== 't'
      && (!!channel.role && channel.role !== RoleEnum.nobody);
  }

  updateSuperstar(channels: IChannelLink[]): void {
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

  onChannelClick(channel: IChannelLink): void {
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


