import { Component, OnInit } from '@angular/core';
import { UserService } from 'src/app/services/user.service';
import {HttpService} from "../../../../services/http.service";
import {IMenuChannel, RoleEnum} from "../../../../model/app-model";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {tap} from "rxjs/operators";
import { FormControl, FormGroup, Validators } from '@angular/forms';

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
  ) { }

  isLoading = false;
  isGhost = true;
  searchPhrase = '';
  userIcon = '';
  userName = '';

  channelsSearching: IMenuChannel[] = [];
  channelsAll: IMenuChannel[] = [];

  isHalloween = false;
  currentYear = 0;    

  newChannelForm: FormGroup = new FormGroup({
    name: new FormControl('', [Validators.required]),
    disclaimer: new FormControl('', []),
  });

  ngOnInit(): void {
    this.load();
    this.checkHalloween();
  }

  load(): void {
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

        this.updateChannelsToShow();
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

  checkHalloween(): void {
    const year = (new Date()).getFullYear();
    const now = new Date();
    const from = new Date(year, 10 - 1, 11);
    const to = new Date(year, 11 - 1, 6);
    this.isHalloween = (now.getTime() >= from.getTime() && now.getTime() <= to.getTime());
    this.currentYear = year;
  }

}
