export interface IUserData {
  nick: string;
  icon: string;
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

export interface IChannel {
  id_place: number;
  parent: number;
  first_parent: number;
  name: string;
  description: string;
  time_changed: string;
  time_viewed: string;
  weight: number;
  canModerate: boolean;
  selected?: boolean;
  time_viewed_deferred?: string;
  spinner?: boolean;
  shortName?: string;
  blackStar?: boolean;
}

export interface ICity {
  channel: IChannel
  children: IChannel[];
}

export const EMPTY_CHANNEL: IChannel = {
  id_place: 0,
  parent: 0,
  first_parent: 0,
  name: '',
  description: '',
  time_changed: '',
  time_viewed: '',
  weight: 0,
  canModerate: false
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
