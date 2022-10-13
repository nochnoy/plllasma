import {Component, EventEmitter, OnInit, Output} from '@angular/core';
import {AppService} from "../services/app.service";

@Component({
  selector: 'app-message-form',
  templateUrl: './message-form.component.html',
  styleUrls: ['./message-form.component.scss']
})
export class MessageFormComponent implements OnInit {

  messageText: string = '';

  @Output('onPost') onNewMessageCreated  = new EventEmitter<string>();

  constructor(
    public appService: AppService
  ) { }

  ngOnInit(): void {
  }

  onSendClick(): void {
    this.onNewMessageCreated.emit(this.messageText);
    this.messageText = '';
  }

}
