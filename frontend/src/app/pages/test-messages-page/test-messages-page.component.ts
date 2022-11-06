import {AfterContentInit, Component, ElementRef, OnInit, ViewChild, ViewChildren} from '@angular/core';
import {Channel} from "../../model/messages/channel.model";
import {EMPTY_CHANNEL, IChannel} from "../../model/app-model";
import {Thread} from "../../model/messages/thread.model";
import {of} from "rxjs";
import {switchMap, tap} from "rxjs/operators";
import {AppService} from "../../services/app.service";
import {TestMessagesMock} from "./test-messages-mock";

@Component({
  selector: 'app-test-messages-page',
  templateUrl: './test-messages-page.component.html',
  styleUrls: ['./test-messages-page.component.scss']
})
export class TestMessagesPageComponent implements OnInit {

  constructor(
    public appService: AppService
  ) { }

  public channel: IChannel = {...EMPTY_CHANNEL};
  public channelModel: Channel = new Channel();
  public isModelError = false;
  public json = '';

  ngOnInit(): void {
    // Накатили дефолтные данные
    this.json = TestMessagesMock.json;
    this.channel.time_viewed = TestMessagesMock.timeViewed;
    // Поверх попробовали накатить LS
    this.lsLoad();

    this.update();
  }

  onUserInput(): void {
    this.update();
    this.lsSave();
  }

  update(): void {
    this.isModelError = false;
    try {
      const j = JSON.parse(this.json);
      this.channelModel.deserialize(j);
    }
    catch(e) {
      this.isModelError = true;
    }
  }

  onExpandClick(event: any, thread: Thread) {
    event.preventDefault();
    if (thread.isLoaded) {
      thread.isExpanded = true;
    } else {
      of({}).pipe(
        switchMap(() => this.appService.getThread$(thread.rootId, this.channel.time_viewed)),
        tap((input: any) => {
          thread.addMessages(input.messages);
          thread.isExpanded = true;
        })
      ).subscribe();
    }
  }

  lsSave(): void {
    try {
      localStorage.setItem('test-messages', JSON.stringify({
        json: this.json,
        time_viewed: this.channel.time_viewed
      }));
    }
    catch(e) {
      console.error('LS: не удалось закодировать');
    }
  }

  lsLoad(): void {
    let lso: any = localStorage.getItem('test-messages');
    if (lso) {
      try {
        lso = JSON.parse(lso);
        this.json = lso.json;
        this.channel.time_viewed = lso.time_viewed;
      } catch (e) {
        console.error('LS: не удалось распарсить');
      }
    }
  }

}
