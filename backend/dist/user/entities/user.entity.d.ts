import { Access } from './access.entity';
import { UserIgnore } from './user-ignore.entity';
export declare class User {
    id_user: number;
    login: string;
    password: string;
    nick: string;
    logkey: string;
    logmode: number;
    sex: number;
    email: string;
    time_joined: Date;
    time_logged: Date;
    icon_old: string;
    usrStatus: string;
    birthday: string;
    country: string;
    city: string;
    icq: string;
    homepage: string;
    businesstype: number;
    businesstext: string;
    realname: string;
    access: Access[];
    ignored: UserIgnore[];
    get icon(): string;
    getClientInfo(): {
        userId: number;
        nick: string;
        icon: string;
        access: Access[];
        unreadChannels: any[];
    };
}
