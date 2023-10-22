import {EventEmitter, Injectable} from '@angular/core';
import {EMPTY_CHANNEL, IMenuChannel, IMenuCity} from "../model/app-model";
import {Observable, of} from "rxjs";
import {switchMap, tap} from "rxjs/operators";
import {HttpService} from "./http.service";
import {Channel} from "../model/messages/channel.model";
import {Message} from "../model/messages/message.model";
import {UserService} from "./user.service";
import {matrixColsCount, MatrixObjectTypeEnum, newDefaultMatrix, newMatrix} from "../model/matrix.model";
import {Const} from "../model/const";

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

        // Построим города

        const citiesIndex: any = {};
        const getOrCreateCity = (id: number):IMenuCity  => {
          if (!citiesIndex[id]) {
            citiesIndex[id] = {
              cityId: id,
              channels: [],
              capital: undefined
            } as IMenuCity;
          }
          return citiesIndex[id];
        };

        this.menuChannels.forEach((channel) => {

          channel.shortName = channel.name.substr(0, Const.channelShornNameLength);

          let city: IMenuCity;
          if (channel.parent) {
            city = getOrCreateCity(channel.parent);
            city.channels.push(channel);
          } else {
            city = getOrCreateCity(channel.id_place);
            city.capital = channel;
            channel.isCapital = true;
            city.channels.push(channel);
          }
        });

        this.menuCities = Object.keys(citiesIndex).map((k) => citiesIndex[k]);
        const cc = this.menuCities; // блять пока это не сделаешь дебаггер не будет видеть содержимое menuCities >:-E

        this.menuCities.forEach((city) => {
          city.channels = city.channels.sort((a, b) => {
            if (a.isCapital && !b.isCapital)
              return -1;
            else if (!a.isCapital && b.isCapital)
              return 1;
            else {
              return a.weight - b.weight;
            }
          });
        });

        this.menuCities = this.menuCities.sort((a, b) => {
          if (a.cityId === Const.defaultChannelId && b.cityId !== Const.defaultChannelId) {
            return -1;
          } else if (a.cityId !== Const.defaultChannelId && b.cityId === Const.defaultChannelId) {
            return 1;
          } else {
            const aCapitalWeight = a.capital?.weight ?? 0;
            const bCapitalWeight = b.capital?.weight ?? 0;
            return aCapitalWeight - bCapitalWeight;
          }
        });

        // Находим города в которых всего по одному каналу, убиваем их и из их каналов складываем город который будет втрорым после Главного
        const oneChannelCities = this.menuCities.filter((city) => city.channels.length === 1);
        this.menuCities = this.menuCities.filter((city) => city.channels.length > 1);
        const cityOfLostChildren: IMenuCity = { cityId: -1, channels: [] };
        oneChannelCities.forEach((c) => cityOfLostChildren.channels = [...cityOfLostChildren.channels, ...c.channels]);
        cityOfLostChildren.channels = cityOfLostChildren.channels.sort((a: IMenuChannel, b: IMenuChannel) => a.weight - b.weight);
        if (cityOfLostChildren.channels.length > 0) {
          this.menuCities.splice(1, 0, cityOfLostChildren);
        }

      }),
      switchMap(() => of(true))
    );

  }

  getChannel(channelId: number, time_viewed: string, page = 0): Observable<Channel> {
    return of({}).pipe(
      switchMap(() => this.httpService.getChannel$(channelId, time_viewed, page)),
      switchMap((input: any) => {

        if (input.error) {
          console.error(`Сервер вернул ошибку ${input.error}`);
          const channel = new Channel();
          channel.id = channelId;
          channel.canAccess = false;
          return of(channel);
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
