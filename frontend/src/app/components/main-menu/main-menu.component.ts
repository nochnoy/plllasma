import { Component, OnInit } from '@angular/core';
import {AppService} from "../../services/app.service";
import {IChannel} from "../../model/app-model";

@Component({
  selector: 'app-main-menu',
  templateUrl: './main-menu.component.html',
  styleUrls: ['./main-menu.component.scss']
})
export class MainMenuComponent implements OnInit {

  channels: IChannel[] = [];

  constructor(
    private appService: AppService
  ) { }

  ngOnInit(): void {
    this.channels = this.appService.channels;
  }

}
