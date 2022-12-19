import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Message, MessageDisplayType} from "../../model/messages/message.model";
import {ShlopMessage} from "../../model/messages/shlop-message.model";
import {AppService} from "../../services/app.service";
import {ChannelService} from "../../services/channel.service";
import {HttpService} from "../../services/http.service";
import {delay, tap} from "rxjs/operators";

@Component({
  selector: 'app-messages',
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.scss']
})
export class MessagesComponent {

  constructor(
    public appService: AppService,
    public httpService: HttpService,
    public channelService: ChannelService,
  ) {}

  ShlopMessageRef = ShlopMessage;

  @Input('placeId')
  public placeId: number = 0;

  @Input('messages')
  public messages:Array<Message> = [];

  @Input('showChildren')
  public showChildren: boolean = true;

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

  onMessageClick(message: Message): void {
    this.channelService.selectMessage(message);
  }

  onNewMessageCreated(): void {
    //this.channelService.getChannel(this.placeId, this.channel?.time_viewed ?? '');
    this.channelService.invalidateChannel(this.placeId);
  }

  onLikeClick(event: any, message: Message, like: 'sps' | 'heh' | 'nep' | 'ogo'): void {
    event.preventDefault();
    if (!message.myLike) {
      this.httpService.likeMessage(message.id, like).pipe(
        delay(600),
        tap(() => {
          this.channelService.unselectMessage();
        })
      ).subscribe();
      message[like]++;
      message.myLike = like;
    }
  }

  onMessageHover(message: Message, isHover: boolean): void {
    if (message.parent) {
      message.parent.isHoverByChild = isHover;
    }
  }
}

