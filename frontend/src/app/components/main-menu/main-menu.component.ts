import {Component, EventEmitter, OnInit, Output} from '@angular/core';
import {AppService} from "../../services/app.service";
import {ChannelService} from "../../services/channel.service";
import {IMenuChannel} from "../../model/app-model";
import {RouterModule} from "@angular/router";
import {CommonModule} from "@angular/common";

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
  ) { }

  @Output('itemClick') itemClick = new EventEmitter<IMenuChannel>();

  ngOnInit(): void {
  }

  logoffClick(event: any): void {
    event.preventDefault();
    this.appService.logoff$().subscribe();
  }

  onItemClick(channel: IMenuChannel): void {
    this.itemClick.emit(channel);
  }

}
