import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {IChannelLink, RoleEnum} from "../../model/app-model";
import {Const} from "../../model/const";

// Каналы с id_place больше этого показываются с иконкой "новый канал"
const NEW_CHANNEL_ID_THRESHOLD = 47;

interface ChannelsDistrict {
  label?: string;
  channels: IChannelLink[];
}

@Component({
  selector: 'app-channels-list',
  templateUrl: './channels-list.component.html',
  styleUrls: ['./channels-list.component.scss']
})
export class ChannelsListComponent implements OnChanges {

  // Все каналы, как их отдаёт channels-list.php
  @Input('channels')
  public channels: IChannelLink[] = [];

  @Input('searchPhrase')
  public searchPhrase: string = '';

  // true - клик по каналу редиректит на него (страница каналов),
  // false - клик эмитит channelSelect (диалог выбора канала)
  @Input('navigateOnClick')
  public navigateOnClick: boolean = true;

  @Output('channelSelect')
  public channelSelect = new EventEmitter<IChannelLink>();

  public RoleEnum = RoleEnum;

  public districts: ChannelsDistrict[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['channels'] || changes['searchPhrase']) {
      this.rebuildDistricts();
    }
  }

  private rebuildDistricts(): void {
    const all = (this.channels || [])
      .map((channel) => ({
        ...channel,
        shortName: channel.shortName ?? channel.name.substr(0, Const.channelShornNameLength)
      }))
      .sort((a, b) => {
        if (a.name > b.name) {
          return 1;
        } else if (a.name < b.name) {
          return -1;
        } else {
          return 0;
        }
      });

    if (this.searchPhrase) {
      const phrase = this.searchPhrase.toUpperCase();
      this.districts = [{
        channels: all.filter((channel) => (channel.name ?? '').toUpperCase().indexOf(phrase) > -1)
      }];
      return;
    }

    const bySection = (id_section: number) => all.filter((channel) => channel.id_section === id_section);

    // Категория "Обновились": звезданутые неподписанные каналы, по свежести.
    // Каналы при этом остаются и в своих категориях ниже - списки независимы.
    const updatedChannels = all
      .filter((channel) => this.isChannelUpdated(channel))
      .sort((a, b) => a.time_changed < b.time_changed ? 1 : (a.time_changed > b.time_changed ? -1 : 0));

    this.districts = [
      ...(updatedChannels.length ? [{label: 'Обновились', channels: updatedChannels}] : []),
      {label: 'Основные', channels: bySection(Const.channelSectionFlex)},
      {label: 'Имена', channels: bySection(Const.channelSectionPerformers)},
      {label: '18+', channels: bySection(Const.channelSectionFlexDark)},
      {label: 'Всякое', channels: bySection(Const.channelSectionOther)},
      {label: 'МК', channels: bySection(Const.channelSectionMen)},
      {label: 'Амазония', channels: bySection(Const.channelSectionAmazonia)},
      {label: 'Техническое', channels: bySection(Const.channelSectionAdmin)},
    ];
  }

  get isNothingFound(): boolean {
    return !!this.searchPhrase && !this.districts.some((district) => district.channels.length > 0);
  }

  // Канал попадает в раздел "Обновились": есть звёздочка (посчитана с учётом игнорируемых
  // и исчезнувших юзеров), канал неподписан, не игнорируется и читаем
  private isChannelUpdated(channel: IChannelLink): boolean {
    return !!channel.star
      && channel.ignoring !== 1
      && channel.at_menu !== 't'
      && (!!channel.role && channel.role !== RoleEnum.nobody);
  }

  public onChannelClick(event: any, channel: IChannelLink): void {
    event.preventDefault();
    this.channelSelect.emit(channel);
  }
}
