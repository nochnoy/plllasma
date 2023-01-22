import { Component, OnInit } from '@angular/core';
import {UntilDestroy} from "@ngneat/until-destroy";
import { HttpService } from 'src/app/services/http.service';
import { UserService } from 'src/app/services/user.service';
import {tap} from "rxjs/operators";
import {IMozaic, IMozaicItem} from "../../model/app-model";

@UntilDestroy()
@Component({
  selector: 'app-channel2-page',
  templateUrl: './channel2-page.component.html',
  styleUrls: ['./channel2-page.component.scss']
})
export class Channel2PageComponent implements OnInit {

  constructor(
    public httpService: HttpService,
    public userService: UserService
  ) { }

  isLoading = false;
  mozaic?: IMozaic;

  ngOnInit(): void {
    this.httpService.mozaicRead$().pipe(
      tap((result) => {
        if (result) {
          this.mozaic = result;
        }
      }),
    ).subscribe();
  }

  getStyle(item: IMozaicItem): string {
    return `left:${(item.x * 20)}px; top:${(item.y * 20)}px; right:${((item.x + item.w) * 20)}px; bottom:${((item.y + item.h) * 20)}px;`;
    //return `inset: 10px 50px 20px 10px`;
  }

}
