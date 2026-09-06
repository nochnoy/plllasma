import { Component, OnInit } from '@angular/core';
import { UserService } from 'src/app/services/user.service';
import {HttpService} from "../../../../services/http.service";
import {IChannelLink, RoleEnum, HALLOWEEN_TEXT} from "../../../../model/app-model";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {switchMap, tap} from "rxjs/operators";
import { Const } from 'src/app/model/const';
import {Router} from "@angular/router";
import {of} from "rxjs";
import {ChannelService} from "../../../../services/channel.service";

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
  ) { }

  isLoading = false;
  searchPhrase = '';
  isHalloween = false;
  currentYear = 0;
  halloweenText = HALLOWEEN_TEXT;
  hereAndNowUsers: string[] = [];

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
  updatedChannels: IChannelLink[] = []; // Категория "Обновившиеся" перед "Основные"

  ngOnInit(): void {
    this.clearSuperstar();
    this.load();
    this.checkHalloween();
    this.getHereAndNow();
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

        // Категория "Обновившиеся": звезданутые неподписанные каналы, по свежести.
        // Каналы при этом остаются и в своих категориях ниже - списки независимы.
        this.updatedChannels = this.channelsAll
          .filter((channel) => this.isChannelUpdated(channel))
          .sort((a, b) => a.time_changed < b.time_changed ? 1 : (a.time_changed > b.time_changed ? -1 : 0));
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

  // Канал попадает в раздел "Обновились": есть серверная звёздочка (_STAR_,
  // уже посчитана с учётом игнорируемых и исчезнувших юзеров), канал неподписан,
  // не игнорируется и читаем
  isChannelUpdated(channel: IChannelLink): boolean {
    return !!channel.star
      && channel.ignoring !== 1
      && channel.at_menu !== 't'
      && (!!channel.role && channel.role !== RoleEnum.nobody);
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

    // Устанавливаем Хэллоуин-текст только если период активен
    if (this.isHalloween) {
      this.halloweenText = HALLOWEEN_TEXT;
    } else {
      this.halloweenText = '';
    }
  }

  getHereAndNow(): void {
    this.httpService.getHereAndNow$().pipe(
      tap((users) => this.hereAndNowUsers = users),
      untilDestroyed(this)
    ).subscribe();
  }
}


