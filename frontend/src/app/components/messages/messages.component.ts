import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Message, MessageDisplayType} from "../../model/messages/message.model";
import {ShlopMessage} from "../../model/messages/shlop-message.model";
import {AppService} from "../../services/app.service";
import {ChannelService} from "../../services/channel.service";
import {HttpService} from "../../services/http.service";
import {delay, tap} from "rxjs/operators";
import {UserService} from "../../services/user.service";
import {INewAttachment} from "../../model/app-model";

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
    public userService: UserService
  ) {}

  ShlopMessageRef = ShlopMessage;

  isSending = false; // TODO: функционал редактирования надо конечно унести в отдельный компонент

  @Input('placeId')
  public placeId: number = 0;

  @Input('messages')
  public messages:Array<Message> = [];

  @Input('showChildren')
  public showChildren: boolean = true;

  @Input('canModerate')
  public canModerate: boolean = false;

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
          this.channelService.deselectMessage();
        })
      ).subscribe();
      message[like]++;
      message.myLike = like;
    }
  }

  onTrashClick(event: any, message: Message): void {
    event.preventDefault();
    if (window.confirm('Удалить сообщение и подсообщения в Мусорку?')) {
      this.httpService.trashMessage(message.id).pipe(
        tap(() => {
          this.channelService.invalidateChannel(this.placeId);
        })
      ).subscribe();
    }
  }

  onDeleteClick(event: any, message: Message): void {
    event.preventDefault();
    if (window.confirm('ПОЛНОСТЬЮ УДАЛИТЬ сообщение и все его подсообщения? Это действие необратимо!')) {
      this.httpService.deleteMessage(message.id).pipe(
        tap(() => {
          this.channelService.invalidateChannel(this.placeId);
        })
      ).subscribe();
    }
  }

  onKitchenClick(event: any, message: Message): void {
    event.preventDefault();
    if (window.confirm('Переместить сообщение и подсообщения в Кухню?')) {
      this.httpService.kitchenMessage(message.id).pipe(
        tap(() => {
          this.channelService.invalidateChannel(this.placeId);
        })
      ).subscribe();
    }
  }

  onYoutubizeClick(event: any, message: Message): void {
    event.preventDefault();
    if (window.confirm('Обработать YouTube ссылки в сообщении?')) {
      this.httpService.youtubizeMessage(message.id).pipe(
        tap((result: any) => {
          if (result.success) {
            alert(`Обработка завершена!\nСоздано аттачментов: ${result.created}\nУдалено старых: ${result.deleted}`);
            this.channelService.invalidateChannel(this.placeId);
          } else {
            alert(`Ошибка: ${result.error}`);
          }
        })
      ).subscribe();
    }
  }

  onS3MigrationClick(event: any, message: Message): void {
    event.preventDefault();
    if (window.confirm('Перенести аттачменты сообщения в S3 хранилище?')) {
      this.httpService.s3MigrationMessage(message.id).pipe(
        tap((result: any) => {
          if (result.success) {
            alert(`Миграция завершена!\nОбработано аттачментов: ${result.processed}\nУспешно: ${result.success}\nОшибок: ${result.failed}`);
            this.channelService.invalidateChannel(this.placeId);
          } else {
            alert(`Ошибка: ${result.error}`);
          }
        })
      ).subscribe();
    }
  }

  onReplyClick(event: any): void {
    event.preventDefault();
    this.channelService.startMessageReply();
  }

  onMessageHover(message: Message, isHover: boolean): void {
    if (message.parent) {
      message.parent.isHoverByChild = isHover;
    }
  }

  onEditClick(event: any): void {
    event.preventDefault();
    this.channelService.startMessageEditing();
  }

  onCancelEditClick(event: any): void {
    event.preventDefault();
    setTimeout(() => { // Без этого не фурычит. Не знаю почему :(
      this.channelService.cancelMessageEditing();
      this.channelService.deselectMessage();
    }, 100);
  }

  onSaveEditClick(): void {
    if (this.channelService.selectedMessage) {
      const messageId = this.channelService.selectedMessage.id;
      const messageText = (this.channelService.selectedMessage.text).trim();
      if (messageText && messageId) {
        this.isSending = true;
        this.appService.editMessage$(messageId, messageText)
          .pipe(
            tap((result: any) => {
              this.isSending = false;
              if (result.error) {
                alert('Поздно :(');
              } else {
                if (this.channelService.selectedMessage) {
                  this.channelService.selectedMessage.text = result.message;
                }
                this.channelService.finishMessageEditing();
                this.channelService.deselectMessage();
              }
            }),
          ).subscribe();
      }
    }
  }

  // Метод для фильтрации аттачментов с иконками (icon > 0)
  getAttachmentsWithIcons(attachments: INewAttachment[] | undefined): INewAttachment[] {
    if (!attachments) return [];
    return attachments.filter(attachment => attachment.icon && attachment.icon > 0);
  }

  // Метод для фильтрации аттачментов без иконок (icon = 0)
  getAttachmentsWithoutIcons(attachments: INewAttachment[] | undefined): INewAttachment[] {
    if (!attachments) return [];
    return attachments.filter(attachment => !attachment.icon || attachment.icon === 0);
  }
}

