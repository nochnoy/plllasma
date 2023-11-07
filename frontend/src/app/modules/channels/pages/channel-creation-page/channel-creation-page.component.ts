import { Component, OnInit } from '@angular/core';
import {HttpService} from "../../../../services/http.service";
import {UserService} from "../../../../services/user.service";
import {RoleEnum} from "../../../../model/app-model";
import {FormControl, FormGroup, Validators} from "@angular/forms";
import {filter, switchMap, tap} from "rxjs/operators";
import {UntilDestroy} from "@ngneat/until-destroy";
import {Router} from "@angular/router";
import {AppService} from "../../../../services/app.service";
import {ChannelService} from "../../../../services/channel.service";

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
    public router: Router,
    public appService: AppService,
    public channelService: ChannelService,
  ) { }

  isLoading = false;
  isGhost = false;

  newChannelForm: FormGroup = new FormGroup({
    name: new FormControl('', [Validators.required]),
    disclaimer: new FormControl('', []),
    section: new FormControl('', []),
    roles: new FormControl('', []),
  });

  ngOnInit(): void {
    this.newChannelForm.get('section')?.disable();
    this.newChannelForm.get('roles')?.disable();
  }

  onNewChannelClick(): void {
    if (window.confirm('Создаём новый канал?')) {
      const name = this.newChannelForm.get('name')?.value ?? '';
      const disclaimer = this.newChannelForm.get('disclaimer')?.value ?? '';
      let channelId = 0;

      this.httpService.createChannel$(name, disclaimer, this.isGhost).pipe(
        tap((result) => {
          if (result.ok) {
            channelId = result.id;

            // Добавим юзеру право на этот канал
            this.userService.user.access.push({
              id_place: result.id,
              role:     RoleEnum.owner,
            });

          }
        }),
        filter(() => !!channelId),
        switchMap(() => this.appService.subscribeChannel$(channelId)),
        switchMap(() => this.channelService.loadChannels$()),
        tap(() => {
          this.router.navigate(['/channel/' + channelId]);
          setTimeout(() => {
            window.alert('Канал готов!');
          }, 1000);
        }),
      ).subscribe();
    }
  }

}
