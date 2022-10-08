import {Component, Input, OnInit} from '@angular/core';
import {Message, MessageDisplayType} from "../../model/messages/message.model";
import {ShlopMessage} from "../../model/messages/shlop-message.model";
import {AppService} from "../../services/app.service";

@Component({
  selector: 'app-board',
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.scss']
})
export class BoardComponent implements OnInit {

  constructor(
    public appService: AppService,
  ) {}

  public ShlopMessageRef = ShlopMessage;

  @Input('messages')
  public messages:Array<Message> = [];

  @Input('showChildren')
  public showChildren: boolean = true;

  ngOnInit() {

  }

  public unshlop(event: any, message: Message) {
    event.preventDefault();
    if (message instanceof ShlopMessage) {
      const shlopMessage = message as ShlopMessage;
      shlopMessage.thread.unshlop(shlopMessage);
    }
  }

  unfoldGray(event: any, message: Message) {
    event.preventDefault();
    message.display = MessageDisplayType.NORMAL;
  }
}
