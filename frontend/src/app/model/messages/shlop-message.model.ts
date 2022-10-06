import { Message } from "./message.model";
import { Shlop } from "./shlop.model";

export class ShlopMessage extends Message {

    constructor (shlop: Shlop) {
        super();
        this.shlop = shlop;
    }

    shlop: Shlop;

}
