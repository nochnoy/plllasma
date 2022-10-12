import { Component, OnInit } from '@angular/core';
import {AppService} from "../services/app.service";
import {tap} from "rxjs/operators";

@Component({
  selector: 'app-message-form',
  templateUrl: './message-form.component.html',
  styleUrls: ['./message-form.component.scss']
})
export class MessageFormComponent implements OnInit {

  constructor(
    public appService: AppService
  ) { }

  ngOnInit(): void {
  }

  onSendClick(): void {
    this.appService.addMessage$(12, 'test').pipe(
      tap((result) => {

      })
    ).subscribe();
  }

}
