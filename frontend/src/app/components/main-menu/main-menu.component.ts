import {Component, EventEmitter, OnInit, Output} from '@angular/core';
import {AppService} from "../../services/app.service";
import {ChannelService} from "../../services/channel.service";
import {IChannel} from "../../model/app-model";

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

  @Output('itemClick') itemClick = new EventEmitter<IChannel>();

  ngOnInit(): void {
  }

  logoffClick(): void {
    this.appService.logoff$().subscribe();
  }

  onItemClick(channel: IChannel): void {
    this.itemClick.emit(channel);
  }

}
