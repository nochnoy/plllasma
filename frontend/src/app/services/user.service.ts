import {Injectable} from '@angular/core';
import {BehaviorSubject} from "rxjs";
import {IUserData, LoginStatus, RoleEnum} from "../model/app-model";

@Injectable({
  providedIn: 'root'
})
export class UserService {

  constructor() { }

  readonly user: IUserData = {
    icon: '',
    nick: '',
    access: []
  }

  loginStatus$ = new BehaviorSubject<LoginStatus>(LoginStatus.unauthorised);

  get isAuthorized(): boolean {
    return Boolean(this.loginStatus$.value === LoginStatus.authorised);
  }

  getRoleTitle(channelId: number): string {
    const rec = this.user.access.find((a) => a.id_place === channelId);
    const role: RoleEnum = rec ? rec.role : RoleEnum.nobody;
    let result = '';
    switch (role) {
      case RoleEnum.nobody:     result = 'никто'; break;
      case RoleEnum.reader:     result = 'читатель'; break;
      case RoleEnum.writer:     result = 'участник'; break;
      case RoleEnum.moderator:  result = 'модератор'; break;
      case RoleEnum.admin:      result = 'админ'; break;
      case RoleEnum.owner:      result = 'владелец'; break;
      case RoleEnum.god:        result = 'господин'; break;
    }
    return result;
  }

  canAccess(channelId: number): boolean {
    return this.user.access.some((a) => a.id_place === channelId && a.role !== RoleEnum.nobody);
  }

  canModerate(channelId: number): boolean {
    const roles = [
      RoleEnum.moderator,
      RoleEnum.admin,
      RoleEnum.owner,
      RoleEnum.god,
    ];
    return this.user.access.some((a) => a.id_place === channelId && roles.includes(a.role))
  }

  canEditMatrix(channelId: number): boolean {
    const roles = [
      RoleEnum.moderator,
      RoleEnum.admin,
      RoleEnum.owner,
      RoleEnum.god,
    ];
    return this.user.access.some((a) => a.id_place === channelId && roles.includes(a.role))
  }

  canUseChannelSettings(channelId: number): boolean {
    const roles = [
      RoleEnum.admin,
      RoleEnum.owner,
      RoleEnum.god,
    ];
    return this.user.access.some((a) => a.id_place === channelId && roles.includes(a.role))
  }

}
