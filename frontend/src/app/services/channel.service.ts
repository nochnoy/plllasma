import {EventEmitter, Injectable} from '@angular/core';
import {IChannelLink, IMenuCity} from "../model/app-model";
import {Observable, of} from "rxjs";
import {switchMap, tap} from "rxjs/operators";
import {HttpService} from "./http.service";
import {Channel} from "../model/messages/channel.model";
import {Message} from "../model/messages/message.model";
import {UserService} from "./user.service";
import {
  IMatrix,
  IMatrixObject,
  matrixCollapsedHeightCells, matrixColsCount,
  MatrixObjectTypeEnum,
  newDefaultMatrix
} from "../model/matrix.model";
import {Const} from "../model/const";

@Injectable({
  providedIn: 'root'
})
export class ChannelService {

  constructor(
    public httpService: HttpService,
    public userService: UserService
  ) { }

  menuChannels: IChannelLink[] = [];
  menuCities: IMenuCity[] = [];
  selectedMessage?: Message;
  channelInvalidSignal = new EventEmitter<number>();

  loadChannels$(): Observable<any> {
    return of({}).pipe(
      switchMap(() => this.httpService.loadChannels$()),
      tap((channels) => {
        this.menuChannels = channels as IChannelLink[];

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
        cityOfLostChildren.channels = cityOfLostChildren.channels.sort((a: IChannelLink, b: IChannelLink) => a.weight - b.weight);
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
        channel.viewed = input.viewed;
        channel.changed = input.changed;
        channel.isIgnoring = !!input.ignoring;
        channel.statSubscribers = input.statSubscribers ?? 0;
        channel.statVisitorsDay = input.statVisitorsDay ?? 0;
        channel.statVisitorsWeek = input.statVisitorsWeek ?? 0;
        channel.statVisitorsMonth = input.statVisitorsMonth ?? 0;

        // Строим ветки
        channel!.deserializeMessages(input);

        // Добавим матрицу
        if (channel) {
          if (input.matrix) {
            channel.matrix = input.matrix;
            // Исправим объекты, выходящие за границы матрицы
            if (channel.matrix) {
              channel.matrix = this.fixMatrixBoundaries(channel.matrix);
              // Найдём высоту матрицы
              let matrixHeight = 0;
              channel.matrix.objects.forEach((o) => {
                matrixHeight = Math.max(matrixHeight, o.y + o.h);
              });
              channel.matrix.height = matrixHeight;
            }
          } else {
            channel.matrix = newDefaultMatrix(channel.name); // Нарисуем дефолтную матрицу из одного блока - заголовка канала
          }
        }

        // Матрицу схлопнем?
        if (channel && channel.matrix) {
          channel.isStarredMessages = channel.starredMessagesExists();
          channel.isStarredMatrix = channel.matrix?.objects.some((object) => {
            return object.type === MatrixObjectTypeEnum.image
              && object.changed > (channel.viewed ?? '');
          }) ?? false;
          channel.matrix.collapsed =
            channel.isStarredMessages &&
            !channel.isStarredMatrix &&
            (channel.matrix.height ?? 0) > matrixCollapsedHeightCells // иначе нет смысла схлопывать
          ;
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

  fixMatrixBoundaries(matrix: IMatrix): IMatrix {
    if (!matrix.objects || matrix.objects.length === 0) {
      return matrix;
    }

    const fixedMatrix = { ...matrix };
    const objectsToMove: IMatrixObject[] = [];
    const objectsInBounds: IMatrixObject[] = [];

    // Разделяем объекты на те, что в границах и те, что нужно переместить
    fixedMatrix.objects.forEach(obj => {
      // Вырезаем объекты неизвестного типа
      if (obj.type === undefined || obj.type < 0 || obj.type > 3) {
        console.log(`Вырезаем объект неизвестного типа: ${obj.type}, id: ${obj.id}`);
        return;
      }

      const isOutOfBounds = obj.x < 0 ||
        obj.x + obj.w > matrixColsCount ||
        obj.w > matrixColsCount;

      if (isOutOfBounds) {
        // Обрезаем ширину объекта если он слишком широкий
        const fixedObj = { ...obj };
        if (fixedObj.w > matrixColsCount) {
          fixedObj.w = matrixColsCount;
        }
        objectsToMove.push(fixedObj);
      } else {
        objectsInBounds.push(obj);
      }
    });

    // Если нет объектов для перемещения, возвращаем исходную матрицу
    if (objectsToMove.length === 0) {
      return matrix;
    }

    // Логируем информацию об исправлении
    console.log(`Исправляем матрицу: найдено ${objectsToMove.length} объектов, выходящих за границы (${matrixColsCount} столбцов)`);
    objectsToMove.forEach((obj, index) => {
      console.log(`  Объект ${index + 1}: x=${obj.x}, y=${obj.y}, w=${obj.w}, h=${obj.h} -> будет перемещен`);
    });

    // Находим Y-координату первой свободной строки
    let maxY = 0;
    objectsInBounds.forEach(obj => {
      maxY = Math.max(maxY, obj.y + obj.h);
    });

    // Перемещаем объекты на первую свободную строку, начиная с первого столбца
    objectsToMove.forEach((obj, index) => {
      const oldX = obj.x;
      const oldY = obj.y;
      obj.x = 0; // Первый столбец
      obj.y = maxY + index; // Каждый следующий объект на новой строке
      console.log(`  Объект ${index + 1}: перемещен с (${oldX},${oldY}) на (${obj.x},${obj.y})`);
    });

    // Объединяем объекты обратно
    fixedMatrix.objects = [...objectsInBounds, ...objectsToMove];

    // Обновляем высоту матрицы
    let newHeight = 0;
    fixedMatrix.objects.forEach(obj => {
      newHeight = Math.max(newHeight, obj.y + obj.h);
    });
    fixedMatrix.height = newHeight;

    console.log(`Матрица исправлена: новая высота = ${newHeight}`);

    return fixedMatrix;
  }

}
