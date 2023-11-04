import { Component, OnInit } from '@angular/core';
import {HttpService} from "../../../../services/http.service";
import {UserService} from "../../../../services/user.service";
import {IMenuChannel, RoleEnum} from "../../../../model/app-model";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {tap} from "rxjs/operators";
import {Const} from "../../../../model/const";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";

@UntilDestroy()
@Component({
  selector: 'app-channel-creation-page',
  templateUrl: './channel-creation-page.component.html',
  styleUrls: ['./channel-creation-page.component.scss']
})
export class ChannelCreationPageComponent implements OnInit {

  constructor(
    public httpService: HttpService,
    public userService: UserService,
  ) { }

  isLoading = false;
  isGhost = true;
  searchPhrase = '';
  userIcon = '';
  userName = '';

  channelsSearching: IMenuChannel[] = [];
  channelsAll: IMenuChannel[] = [];

  currentYear = 0;

  newChannelForm: FormGroup = new FormGroup({
    name: new FormControl('', [Validators.required]),
    disclaimer: new FormControl('', []),
  });

  ngOnInit(): void {
    this.load();
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

  onSearchClearClick(event: any): void {
    event.preventDefault();
    this.searchPhrase = '';
  }

  onNewChannelClick(): void {
    if (window.confirm('Создаём новый канал?')) {
      const name = this.newChannelForm.get('name')?.value ?? '';
      const disclaimer = this.newChannelForm.get('disclaimer')?.value ?? '';
      this.httpService.createChannel$(name, disclaimer).pipe(
        tap((result) => {
          if (result.ok) {

            // Добавим юзеру право на этот канал
            this.userService.user.access.push({
              id_place: result.id,
              role:     RoleEnum.owner,
            });

            this.newChannelForm.reset();
            this.load();
            setTimeout(() => window.alert('Поздравляем! Вы владелец этого канала.'), 1000);
          }
        })
      ).subscribe();
    }
  }

  onGhostClick(): void {

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
