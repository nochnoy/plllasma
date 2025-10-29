export interface IHttpResult {
  error?: string;
}

export interface IUserData {
  nick: string;
  icon: string;
  access: IAccess[];
  superstar?: number; // значение "цифровой звёздочки" на ссылке "каналы" - сколько есть непрочитанных неподписанных каналов на которые у юзера есть права
}

export enum LoginStatus {
  unauthorised = 0,
  authorised = 1,
  authorising = 2,
}

export enum Sex {
  male = 0,
  unknown = 1,
  female = 2,
}

export interface AuthDialogResult {
  login?: string;
  password?: string;
}

export interface IFocus {
  l: number;
  r: number;
  t: number;
  b: number;
  sps: number;
  he: number;
  nep: number;
  ogo: number;
  likes: ILike[];
  isNew: boolean;
  isEditing: boolean;
  id?: number;
  channelId?: number;
  messageId?: number;
  fileId?: number;
  ghost: boolean;
  nick?: string;
  icon?: number | '-';
  default?: boolean;
  alreadyLiked?: boolean;
  maxScale?: number;
}

export interface ILike {
  id: 'sps' | 'he' | 'nep' | 'ogo';
  count: number;
}

export interface IImageData {
  imageLoaded: boolean;
  focusesLoaded: boolean;
  imageWidth: number;
  imageHeight: number;
  url: string;
  focuses: IFocus[];
  file: IFileInfo;
}

export interface IFileInfo {
  path: string;
  type: TFileType;
}

export type TFileType = 'unknown' | 'image' | 'file' | 'video';

export interface IChannelLink {
  id_place: number;
  parent: number;
  id_section: number;
  first_parent: number;
  name: string;
  description: string;
  time_changed: string;
  time_viewed: string;
  weight: number;
  selected?: boolean;
  spinner?: boolean;
  shortName?: string;
  timeViewedDeferred?: string; // Чисто клиентское поле. В него льётся фактическое time_viewed канала пока юзер с него не уйдёт.
  isCapital?: boolean;
  at_menu?: 't' | 'f';
  role?: RoleEnum;
  ignoring?: 1 | 0;
}

export interface IMenuCity {
  capital?: IChannelLink;
  cityId: number;
  channels: IChannelLink[];
}

export interface INewAttachment {
  id: string;
  type: 'file' | 'image' | 'video' | 'youtube';
  created: string;
  icon?: number; // Версия иконки (0 - нет, >0 - есть с версией)
  preview?: number; // Версия превью (0 - нет, >0 - есть с версией)
  file?: number; // Версия файла (0 - нет, >0 - есть с версией)
  filename?: string; // Оригинальное имя файла
  title?: string; // Название аттачмента (особенно для YouTube видео)
  source?: string; // Исходный URL (для YouTube)
  status: 'unavailable' | 'pending' | 'ready' | 'rejected';
  views?: number;
  downloads?: number;
  size?: number;
  duration?: number; // Длительность видео в миллисекундах (только для YouTube)
  s3?: number; // Файл хранится в S3 (1) или локально (0)
}

export const EMPTY_CHANNEL: IChannelLink = {
  id_place: 0,
  parent: 0,
  id_section: 0,
  first_parent: 0,
  name: '',
  description: '',
  time_changed: '',
  time_viewed: '',
  weight: 0,
  isCapital: false,
}

export interface IAttachment {
  id: number;
  messageId: number;
}

export interface IUploadingAttachment {
  file: File;
  name: string;
  isImage: boolean;
  isReady: boolean;
  bitmap?: any;
  error?: string;
}

export interface IMember {
  nick: string;
  icon: string;
  description: string;
  time_logged: string;
  time_joined: string;
  today: boolean; // Юзер был на сайте последние 24 часа?
  msgcount: number;
  sps: number;
  city: string;
  country: string;
  time_visitted: string;
  profile: string;
  profile_visits: number;
  gray: boolean;
  dead: boolean;
  profileStarred: boolean;
  inboxSize: number;
  inboxStarred: boolean;
  sex: Sex;
  profilephoto: string;
}

export interface IMailMessage {
  nick: string;
  unread: boolean;
  message: string;
  time_created: string;
}

export enum RoleEnum {
  reader = 0,
  writer = 1,
  moderator = 2,
  admin = 3,
  owner = 4,
  god = 5,
  nobody = 9
}

export interface IAccess {
  id_place: number;
  role: RoleEnum;
}

export interface IChannelSection {
  id: number;
  label: string;
  description: string;
  default?: boolean;
}

// Константы для праздничных сообщений
export const HALLOWEEN_TEXT = '';
