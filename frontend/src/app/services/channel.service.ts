import {EventEmitter, Injectable} from '@angular/core';
import {EMPTY_CHANNEL, IMenuChannel, IMenuCity} from "../model/app-model";
import {Observable, of} from "rxjs";
import {switchMap, tap} from "rxjs/operators";
import {HttpService} from "./http.service";
import {Channel} from "../model/messages/channel.model";
import {Message} from "../model/messages/message.model";
import {UserService} from "./user.service";
import {matrixColsCount, MatrixObjectTypeEnum, newDefaultMatrix, newMatrix} from "../model/matrix.model";

@Injectable({
  providedIn: 'root'
})
export class ChannelService {

  constructor(
    public httpService: HttpService,
    public userService: UserService
  ) { }

  menuChannels: IMenuChannel[] = [];
  menuCities: IMenuCity[] = [];
  selectedMessage?: Message;
  channelInvalidSignal = new EventEmitter<number>();

  loadChannels$(): Observable<any> {
    return of({}).pipe(
      switchMap(() => this.httpService.loadChannels$()),
      tap((channels) => {
        this.menuChannels = channels as IMenuChannel[];

        // Вырежем канал "Мы"
        this.menuChannels = this.menuChannels.filter((channel) => channel.id_place !== 46);

        // TODO: по хорошему всё это выкинуть и при получении каналов выстроть их дерево. parent, children все дела.
        this.menuCities = this.menuChannels
          .filter((channel) => !channel.parent)
          .map((channel) => ({
              channel: channel,
              children: []
            })
          );
        this.menuChannels
          .filter((channel) => channel.parent)
          .forEach((channel) => {
            const city = this.menuCities.find((city) => city.channel.id_place === channel.parent);
            city?.children.push(channel);
          });
        this.menuCities.forEach((city) => {
          city.children = city.children.sort((a, b) => a.weight - b.weight);
          city.children.unshift(city.channel);
        });
        this.menuCities = this.menuCities.sort((a, b) => a.channel.weight - b.channel.weight);

        this.menuChannels.forEach((channel) => {
          channel.shortName = channel.name.substr(0, 14);
          channel.canModerate = this.userService.canModerate(channel.id_place);
        });

      }),
      switchMap(() => of(true))
    );

  }

  getChannel(channelId: number, time_viewed: string, page = 0): Observable<Channel> {
    return of({}).pipe(
      switchMap(() => this.httpService.getChannel$(channelId, time_viewed, page)),
      switchMap((input: any) => {
        if (input.error) {
          throw (`Сервер вернул ошибку ${input.error}`);
        }

        // Канал на меню лишается звёздочки
        const channelAtMenu = this.menuChannels.find((channel) => channel.id_place === channelId);
        if (channelAtMenu) {
          channelAtMenu.timeViewedDeferred = input.viewed;
          channelAtMenu.time_changed = input.changed;
        }

        let channel = new Channel();
        channel.id = channelId;
        channel.name = input.name;
        channel.atMenu = input.atMenu;

        // Строим ветки
        channel!.deserializeMessages(input);

        // Добавим матрицу
        if (channel) {
          if (input.matrix) {
            channel.matrix = input.matrix;
          } else {
            channel.matrix = newDefaultMatrix(channel.name); // Нарисуем дефолтную матрицу из одного блока - заголовка канала
          }
        }
        return of(channel);
      })
    );
  }

  selectMessage(message: Message): void {
    if (this.selectedMessage === message) {
      return; // Уже заселекчено
    }
    if (this.selectedMessage && !this.selectedMessage.canDeselect) {
      return; // Нельзя селектить пока не завершим редактирование сообщения
    }
    this.deselectMessage();
    this.selectedMessage = message;
  }

  deselectMessage(): void {
    if (this.selectedMessage) {
      if (!this.selectedMessage.canDeselect) {
        return; // Нельзя деселектить пока не завершим редактирование сообщения
      }
      this.selectedMessage.isEditMode = false;
      this.selectedMessage.isReplyMode = false;
      delete this.selectedMessage;
    }
  }

  startMessageReply(): void {
    if (this.selectedMessage) {
      this.selectedMessage.isReplyMode = true;
      this.selectedMessage.isEditMode = false;
      this.selectedMessage.canDeselect = false;
    }
  }

  cancelMessageReply(): void {
    if (this.selectedMessage) {
      this.selectedMessage.isReplyMode = false;
      this.selectedMessage.canDeselect = true;
    }
  }

  startMessageEditing(): void {
    if (this.selectedMessage) {
      this.selectedMessage.isEditMode = true;
      this.selectedMessage.isReplyMode = false;
      this.selectedMessage.canDeselect = false;
      this.selectedMessage.textBeforeEdit = this.selectedMessage.text;
    }
  }

  cancelMessageEditing(): void {
    if (this.selectedMessage) {
      this.selectedMessage.text = this.selectedMessage.textBeforeEdit;
      this.selectedMessage.textBeforeEdit = '';
      this.selectedMessage.isEditMode = false;
      this.selectedMessage.canDeselect = true;
    }
  }

  finishMessageEditing(): void {
    if (this.selectedMessage) {
      this.selectedMessage.textBeforeEdit = '';
      this.selectedMessage.isEditMode = false;
      this.selectedMessage.canDeselect = true;
    }
  }

  invalidateChannel(channelId: number): void {
    this.channelInvalidSignal.emit(channelId);
  }

  // Применяем отложенные даты в timeChanged
  applyDeferredMenuTimes(excludeChannelId: number): void {
    this.menuChannels
      .filter((channel) => channel.id_place !== excludeChannelId)
      .forEach((channel) => {
        if (channel.timeViewedDeferred) {
          channel.time_viewed = channel.timeViewedDeferred;
          delete channel.timeViewedDeferred;
        }
      })
    ;
  }

}
