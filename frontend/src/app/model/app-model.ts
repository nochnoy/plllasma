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

export interface IUserData {
  nick: string;
  icon: string;
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
