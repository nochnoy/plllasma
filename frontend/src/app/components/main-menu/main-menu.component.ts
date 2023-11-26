import {Component, EventEmitter, OnInit, Output} from '@angular/core';
import {AppService} from "../../services/app.service";
import {ChannelService} from "../../services/channel.service";
import {IChannelLink} from "../../model/app-model";
import {RouterModule} from "@angular/router";
import {CommonModule} from "@angular/common";
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-main-menu',
  templateUrl: './main-menu.component.html',
  styleUrls: ['./main-menu.component.scss'],
  standalone: true,
  imports: [RouterModule, CommonModule ]
})
export class MainMenuComponent implements OnInit {

  constructor(
    public appService: AppService,
    public channelService: ChannelService,
    public userService: UserService
  ) { }

  @Output('itemClick') itemClick = new EventEmitter<IChannelLink>();

  ngOnInit(): void {
  }

  logoffClick(event: any): void {
    event.preventDefault();
    this.appService.logoff$().subscribe();
  }

  onItemClick(channel: IChannelLink): void {
    this.itemClick.emit(channel);
  }

}
