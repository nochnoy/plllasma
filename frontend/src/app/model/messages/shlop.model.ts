import {BLANK_MESSAGE, Message} from "./message.model";
import {Utils} from "../../utils/utils";

export class Shlop {
    start: Message = BLANK_MESSAGE;
    finish: Message = BLANK_MESSAGE;
    length: number = 0;
    lengthText: string = '';

    public setLength(value:number) {
        this.length = value;
        this.lengthText = 'Скрыто ' + this.length + Utils.chisl(this.length, ['сообщение', 'сообщения', 'сообщений']);
    }
}
