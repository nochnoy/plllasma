import { Component, OnInit } from '@angular/core';
import {UntilDestroy} from "@ngneat/until-destroy";
import { HttpService } from 'src/app/services/http.service';
import { UserService } from 'src/app/services/user.service';

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

  ngOnInit(): void {
  }

}
