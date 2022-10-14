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
  cities: ICity[] = [];

  constructor(
    private appService: AppService
  ) { }

  ngOnInit(): void {
    this.channels = this.appService.channels;
    // TODO: по хорошему всё это выкинуть и при получении каналов выстроть их дерево. parent, children все дела.
    this.cities = this.channels
      .filter((channel) => !channel.parent)
      .map((channel) => ({
          channel: channel,
          children: []
        })
    );
    this.channels
      .filter((channel) => channel.parent)
      .forEach((channel) => {
        const city = this.cities.find((city) => city.channel.id_place === channel.parent);
        city?.children.push(channel);
      });
    this.cities.forEach((city) => {
      city.children = city.children.sort((a, b) => a.weight - b.weight);
      city.children.unshift(city.channel);
    });
    this.cities = this.cities.sort((a, b) => a.channel.weight - b.channel.weight);
  }

  logoffClick(): void {
    this.appService.logoff$().subscribe();
  }

}

interface ICity {
  channel: IChannel
  children: IChannel[];
}
