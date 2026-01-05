import {IChannelSection} from "./app-model";

export class Const {
  static defaultChannelId = 1;

  static focusIconSize = 42; // Должна быть равна переменной --focus-icon-size
  static focusIconMargin = 8; // Должна быть равна переменной --focus-icon-margin
  static focusInfoHeight = 80; // Должна быть равна переменной --focus-info-height

  static maxFileUploadSizeMb = 1024; // 1 ГБ

  static remInPixels: number = parseFloat(getComputedStyle(document.documentElement).fontSize); // 1rem В пикселях

  static channelShornNameLength = 14;

  static channelSectionOther = 0;
  static channelSectionFlex = 1;
  static channelSectionFlexDark = 2;
  static channelSectionPerformers = 3;
  static channelSectionMen = 5;
  static channelSectionAmazonia = 6;
  static channelSectionAdmin = 7;

  static channelSections: IChannelSection[] = [
    { id: Const.channelSectionFlex,         label: 'Основной',          description: 'для каналов, посвящённых гибкости', default: true },
    { id: Const.channelSectionPerformers,   label: 'Имена',             description: 'для каналов, появящённых отдельным исполнителям, тренерам, и т.д.' },
    { id: Const.channelSectionFlexDark,     label: '18+',               description: 'для каналов, посвящённых гибкости с элементами обнажёнки' },
    { id: Const.channelSectionOther,        label: 'Всякое',            description: 'для каналов на всякие другие темы' },
    { id: Const.channelSectionMen,          label: 'Мужская конторсия', description: 'для каналов про мужскую гибкость' },
    { id: Const.channelSectionAmazonia,     label: 'Амазония',          description: 'каналы только для женщин' },
    { id: Const.channelSectionAdmin,        label: 'Техническое',       description: 'для админских каналов' },
  ];

}
