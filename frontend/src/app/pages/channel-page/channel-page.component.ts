import { Component, OnInit } from '@angular/core';
import {AppService} from "../../services/app.service";
import {ActivatedRoute} from "@angular/router";
import {of} from "rxjs";
import {switchMap, tap} from "rxjs/operators";
import {IChannel} from "../../model/app-model";

@Component({
  selector: 'app-channel-page',
  templateUrl: './channel-page.component.html',
  styleUrls: ['./channel-page.component.scss']
})
export class ChannelPageComponent implements OnInit {

  constructor(
    public appService: AppService,
    public activatedRoute: ActivatedRoute
  ) { }

  readonly defaultChannelId = 1;
  channel?: IChannel;

  ngOnInit(): void {
    of({}).pipe(
      switchMap(() => this.activatedRoute.url),
      tap((urlSegments) => {
        let id = this.defaultChannelId;
        if (urlSegments.length) {
          id = parseInt(urlSegments[0].path, 10) ?? this.defaultChannelId;
        }
        this.channel = this.appService.channels.find((channel) => channel.id_place === id);
      })
    ).subscribe();
  }

}
