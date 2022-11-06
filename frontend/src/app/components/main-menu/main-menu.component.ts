import { Component, OnInit } from '@angular/core';
import {AppService} from "../../services/app.service";
import {ChannelService} from "../../services/channel.service";

@Component({
  selector: 'app-main-menu',
  templateUrl: './main-menu.component.html',
  styleUrls: ['./main-menu.component.scss']
})
export class MainMenuComponent implements OnInit {

  constructor(
    public appService: AppService,
    public channelService: ChannelService,
  ) { }

  ngOnInit(): void {
  }

  logoffClick(): void {
    this.appService.logoff$().subscribe();
  }

}
