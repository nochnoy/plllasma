export interface IUserData {
  nick: string;
  icon: string;
}

export enum LoginStatus {
  unauthorised = 0,
  authorised = 1,
  authorising = 2,
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
