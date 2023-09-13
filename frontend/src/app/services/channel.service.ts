import {EventEmitter, Injectable} from '@angular/core';
import {EMPTY_CHANNEL, IChannel, ICity} from "../model/app-model";
import {Observable, of} from "rxjs";
import {switchMap, tap} from "rxjs/operators";
import {HttpService} from "./http.service";
import {Channel} from "../model/messages/channel.model";
import {Message} from "../model/messages/message.model";
import {UserService} from "./user.service";
import {newMatrix} from "../model/matrix.model";

@Injectable({
  providedIn: 'root'
})
export class ChannelService {

  constructor(
    public httpService: HttpService,
    public userService: UserService
  ) { }

  channels: IChannel[] = [];
  channelModels = new Map<number, Channel>();
  cities: ICity[] = [];
  selectedMessage?: Message;
  channelInvalidSignal = new EventEmitter<number>();

  loadChannels$(): Observable<any> {
    return of({}).pipe(
      switchMap(() => this.httpService.loadChannels$()),
      tap((channels) => {
        this.channels = channels as IChannel[];

        // Вырежем канал "Мы"
        this.channels = this.channels.filter((channel) => channel.id_place !== 46);

        // TODO: по хорошему всё это выкинуть и при получении каналов выстроть их дерево. parent, children все дела.
        this.cities = this.channels
          .filter((channel) => !channel.parent)
          .map((channel) => ({
              channel: channel,
              children: []
            })
          );
        this.channels
          .filter((channel) => channel.parent)
          .forEach((channel) => {
            const city = this.cities.find((city) => city.channel.id_place === channel.parent);
            city?.children.push(channel);
          });
        this.cities.forEach((city) => {
          city.children = city.children.sort((a, b) => a.weight - b.weight);
          city.children.unshift(city.channel);
        });
        this.cities = this.cities.sort((a, b) => a.channel.weight - b.channel.weight);

        this.channels.forEach((channel) => {
          const rawChannel = channel as any;
          channel.shortName = channel.name.substr(0, 14);
          channel.canModerate = (rawChannel.role === 5);
        });

      }),
      switchMap(() => of(true))
    );

  }

  getChannel(channelId: number, time_viewed: string, page = 0): Channel {
    const channelAtMenu: IChannel = this.channels.find((c) => c.id_place === channelId) || {...EMPTY_CHANNEL};
    let channelModel = this.channelModels.get(channelId);

    channelAtMenu.spinner = true;

    if (!channelModel) {
      channelModel = new Channel();
      channelModel.id = channelId;
      this.channelModels.set(channelId, channelModel);
    }

    of({}).pipe(
      switchMap(() => this.httpService.getChannel$(channelId, time_viewed, page)),
      tap((input) => {
        channelAtMenu.spinner = false;

        if (input.error) {
          console.error(`Сервер вернул ошибку ${input.error}`);
        } else {

          channelModel!.deserialize(input);

          // Канал который был выбран до этого, актуализируют свою time_viewed и лишается звёздочки
          this.channels
            .filter((channel) => channel.id_place !== channelId)
            .forEach((channel) => {
              if (channel.time_viewed_deferred) {
                channel.time_viewed = channel.time_viewed_deferred;
                delete channel.time_viewed_deferred;
              }
            });

          // Выбранный канал сохраняет time_viewed до момента когда мы с него уйдём
          const channelAtMenu = this.channels.find((channel) => channel.id_place === channelId);
          if (channelAtMenu) {
            channelAtMenu.time_viewed_deferred = input.viewed;
          }

          // Добавим матрицу. Это делается здесь а не в deserialize т.к. она не имеет отношения к веткам
          if (channelModel) {
            if (input.matrix) {
              channelModel.matrix = input.matrix;
            } else {
              channelModel.matrix = newMatrix();
            }
          }
        }
      })
    ).subscribe();

    return channelModel;
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

}
