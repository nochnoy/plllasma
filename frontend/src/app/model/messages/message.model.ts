import {BLANK_THREAD, Thread} from "./thread.model";
import {IAttachment} from "../app-model";

export const BLANK_MESSAGE = <Message>{text: 'BLANK'};

export class Message {
  id: number = 0;
  display: number = MessageDisplayType.NORMAL; // Способ показа
  parentId: number = 0;
  rootId: number = 0;
  thread: Thread = BLANK_THREAD;
  attachments: IAttachment[] = [];
  nick = '';
  icon = '';
  text = '';
  textBeforeEdit = '';
  timeCreated = '';
  isStarred = false;
  isHoverByChild = false;
  important = false; // не схлопывать это сообщение в серых деревьях. Оно важное.
  commentsCount = 0; // присылаемое с сервера кол-во комментов для рутовых сообщений (когда сами комменты ещё не подгружены)
  sps = 0;
  heh = 0;
  nep = 0;
  ogo = 0;
  myLike?: 'sps' | 'heh' | 'nep' | 'ogo';
  parent?: Message;
  children?: Array<Message>;

  public getChild(childId: number): Message | null {
    if (this.children) {
      for (let i = 0; i < this.children.length; i++) {
        if (this.children[i].id === childId) {
          return this.children[i];
        }
      }
    }
    return null;
  }

  public addOrUpdateChild(newChild: Message) {
    if (!this.children) {
      this.children = new Array<Message>();
    }
    const oldChild = this.getChild(newChild.id);
    if (oldChild) {
      oldChild.merge(newChild);
    } else {
      if (newChild.parent !== this) {
        this.children.push(newChild);
        newChild.setParent(this);
      }
    }
  }

  public removeChild(child: Message) {
    if (this.children) {
      let ix = this.children.indexOf(child);
      if (ix > -1) {
        this.children.splice(ix, 1);
        child.setParent(undefined);
      }
    }
  }

  public transferChildrenTo(newParent: Message) {
    if (this.children) {
      let child: Message;
      for (let i = 0; i < this.children.length; i++) {
        child = this.children[i];
        newParent.addOrUpdateChild(child);
      }
      this.children.length = 0;
    }
  }

  public setParent(parent?: Message) {
    this.parent = parent;
  }

  public clone(): Message {
    let c = new Message();

    c.id = this.id;
    c.parentId = this.parentId;
    c.rootId = this.rootId;
    c.thread = this.thread;
    c.nick = this.nick;
    c.icon = this.icon;
    c.text = this.text;
    c.timeCreated = this.timeCreated;
    c.isStarred = this.isStarred;
    c.important = this.important;
    c.attachments = this.attachments;
    c.sps = this.sps;
    c.heh  = this.heh;
    c.nep = this.nep;
    c.ogo = this.ogo;

    return c;
  }

  public merge(m: Message) {
    this.parentId = m.parentId;
    this.rootId = m.rootId;
    this.thread = m.thread;
    this.nick = m.nick;
    this.icon = m.icon;
    this.text = m.text;
    this.timeCreated = m.timeCreated;
    this.isStarred = m.isStarred;
    this.important = m.important;
    this.attachments = m.attachments;
    this.sps = m.sps;
    this.heh  = m.heh;
    this.nep = m.nep;
    this.ogo = m.ogo;
  }

  public deserialize(raw: any, rootId: number) {
    this.id = raw.id;
    this.parentId = raw.pid;
    this.rootId = rootId;
    this.nick = raw.n;
    this.icon = raw.i;
    this.text = raw.t;
    this.timeCreated = raw.d;
    this.isStarred = raw.star;
    this.sps = raw.sps;
    this.heh  = raw.he;
    this.nep = raw.nep;
    this.ogo = raw.ogo;

    this.attachments.length = 0;
    for (let i = 0; i < raw.a; i++) {
      this.attachments.push({
        id: i,
        messageId: this.id
      });
    }

    if (raw.hasOwnProperty('cm')) {
      this.commentsCount = raw.cm;
    }

    if (!(this.id > 0)) {
      // id сообщений должны быть только числовыми и увеличиваться вверх!
      // на это опирается сортировка и подсветка новых сообщений!
      throw 'Karamba!';
    }
  }
}

export class MessageDisplayType {
  static NORMAL = 0;
  static GRAY = 1;
  static SHLOP = 10;
}
