import {BLANK_MESSAGE, Message} from "./message.model";
import {Utils} from "../../utils/utils";

export class Shlop {
    start: Message = BLANK_MESSAGE;
    finish: Message = BLANK_MESSAGE;
    length: number = 0;
    lengthText: string = '';

    public updateLengthText() {
        this.lengthText = 'Скрыто ' + this.length + Utils.chisl(this.length, ['сообщение', 'сообщения', 'сообщений']);
    }
}
