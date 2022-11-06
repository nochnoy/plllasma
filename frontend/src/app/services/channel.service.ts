import { Injectable } from '@angular/core';
import {IChannel, ICity} from "../model/app-model";
import {Observable, of} from "rxjs";
import {switchMap, tap} from "rxjs/operators";
import {HttpService} from "./http.service";

@Injectable({
  providedIn: 'root'
})
export class ChannelService {

  constructor(
    public httpService: HttpService
  ) { }

  channels: IChannel[] = [];
  cities: ICity[] = [];

  loadChannels$(): Observable<any> {
    return of({}).pipe(
      switchMap(() => this.httpService.loadChannels$()),
      tap((channels) => {
        this.channels = channels as IChannel[];

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

      }),
      switchMap(() => of(true))
    );

  }

}
