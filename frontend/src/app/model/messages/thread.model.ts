import {Shlop} from './shlop.model';
import {BLANK_MESSAGE, Message, MessageDisplayType} from './message.model';
import {ShlopMessage} from './shlop-message.model';
import {Utils} from "../../utils/utils";

export const BLANK_THREAD = <Thread>{};

export class Thread {

  constructor(rootId: number) {
    this.rootId = rootId;
  }

  public rootId: number;
  public root: Message = BLANK_MESSAGE;
  public starred = new Array<Message>();
  public starredMaxId = 0;
  public isDigest = false;
  public isExpanded = false;
  public commentsCount: number = 0;
  public commentsCountText = '';

  // Хеш сообщений дерева
  // Помни, что при  схлопах сообщения исчезают из иерархии, но остаются в этом хеше
  private map = new Map<number, Message>();

  private shlops = new Array<Shlop>();

  public get isLoaded(): boolean {
    //TODO: сомнительный способ, багоопасный. Но пока пусть будет так.
    return this.map.values.length == this.commentsCount;
  }

  public addMessages(rawMessages: Array<any>) {
    rawMessages.forEach(m => {
      this.addMessage(m);
    });
  }

  public addMessage(rawMessage: any): Message {
    let m = this.getOrCreateMessage(rawMessage.id);
    m.deserialize(rawMessage, this.rootId);

    if (m.parentId) {
      let parent = this.getOrCreateMessage(m.parentId);
      parent.addChild(m);
      if (m.isStarred) {
        m.important = true;
        parent.important = true;
        this.starred.push(m);
        if (this.starredMaxId < m.id) {
          this.starredMaxId = m.id;
        }
      }
      this.increaseCommentsCount(); // Только для не рутовых. Рут это не коммент.
    } else {
      this.root = m;
      m.important = true;
    }
    return m;
  }

  public addDigestCopy(m: Message): Message {
    let c: Message;

    const old = this.getMessage(m.id);
    if (old) {
      // Если уже есть старое сообщение с таким id - вольём в него данные из нового
      c = old;
      c.merge(m);
    } else {
      c = m.clone();
    }

    if (c.parentId) {
      let parent = this.getOrCreateMessage(c.parentId);
      parent.addChild(c);
    } else {
      this.root = c;
    }

    c.thread = this; // А то всякие мерджи давали ему ссылку на оригинальное дерево

    // Серыми становятся все сообщения в дайджесте кроме звезданутых
    if (!c.isStarred) {
      c.display = MessageDisplayType.GRAY;
    }

    return c;
  }

  private getMessage(id: number): Message | undefined {
    let m = this.map.get(id);
    return m || undefined;
  }

  private getOrCreateMessage(id: number): Message {
    let m = this.map.get(id);
    if (!m) {
      m = new Message();
      m.id = id;
      m.thread = this;
      this.map.set(id, m);
    }
    return m;
  }

  public sort() {
    this.map.forEach((message) => {
      if (message.children) {
        message.children.sort((a: Message, b: Message): number => {
          let aid = a.id;
          let bid = b.id;
          if (aid < bid)
            return -1;
          else if (aid > bid)
            return 1;
          else
            return 0;
        });
      }
    });
  }

  public findShlops(message: Message) {
    let m: Message | undefined = message;
    let shlop: Shlop | undefined;

    while (m) {

      // Оцениваем схлопабельность сообщения
      switch (true) {

        // Несхлопабельно
        case !m.children:           // потому что дошли до самого низа (такого никогда не случится, мы скорее дойдём до сообщения со звёздочкой)
        case m.children && m.children.length > 1: // потому что развилка
        case m.isStarred:           // потому что это сообщение со звёздочкой
        case m.important:           // потому что это родитель сообщения со звёздочкой
          // Если мы были в процессе набора схлопа - закрываем его
          if (shlop) {
            if (shlop.length > 2) {
              this.shlops.push(shlop);
            }
            shlop = undefined; // Этот схлоп закончился. Ищем следующий.
          }
          break;

        // Схлопабельно
        default:
          if (shlop) {
            // Продолжаем начатый схлоп
            shlop.length++;
            shlop.finish = m;
          } else {
            // Открываем новый схлоп
            shlop = new Shlop();
            shlop.start = m;
            shlop.finish = m;
            shlop.length = 1;
          }
      }

      // Углубляемся дальше

      if (m.children) {
        if (m.children.length == 1) {
          m = m.children[0];
        } else {
          // Дошли до развилки. На этом работа этой копии функции закончена
          // делаем рекурсивные вызовы для каждой из веток
          for (let i = 0; i < m.children.length; i++) {
            this.findShlops(m.children[i]);
          }
          m = undefined; // the end
        }
      } else {
        m = undefined; // the end
      }
    }
  }

  public buildDigest(): Thread {
    let starredMessage: Message;
    let dm: Message;
    let m: Message | undefined;
    let dt = new Thread(this.rootId);
    dt.isDigest = true;
    dt.starredMaxId = this.starredMaxId;

    // Строим серые деревья (дайджесты)

    for (let i = 0; i < this.starred.length; i++) {
      starredMessage = this.starred[i];
      m = starredMessage;
      while (m) {
        dm = dt.addDigestCopy(m);
        m = m.parent;
      }
    }

    // Строим схлопы в дайджестах

    this.shlops.length = 0;
    this.findShlops(dt.root);

    let shlop: Shlop;
    for (let i = 0; i < this.shlops.length; i++) {
      shlop = this.shlops[i];

      // Схлопнем
      let s = new ShlopMessage(shlop);
      s.id = shlop.start.id;
      s.display = MessageDisplayType.SHLOP;
      s.thread = dt;

      let startParent = shlop.start.parent;
      startParent?.removeChild(shlop.start); // ВНИМАНИЕ! Мы удаляем детей сообщения, но они всё ещё фигурируют в хеше дерева (map)
      startParent?.addChild(s);
      shlop.finish.transferChildrenTo(s);
    }

    // Сортируем построенное дерево

    dt.sort();

    return dt;
  }

  public unshlop(m: ShlopMessage) {
    // Все сообщения в схлопе сделаем не серыми
    let m1: Message | undefined = m.shlop.finish;
    while (m1) {
      m1.display = MessageDisplayType.NORMAL;
      m1 = m1.parent;
    }

    let parent = m.parent;
    m.transferChildrenTo(m.shlop.finish); // Дети, которые крепились к схлоп-сообщению, вешаются в конец схлопнутой последовательности
    parent?.removeChild(m);
    parent?.addChild(m.shlop.start);
    this.sort();
  }

  private updateCommentsCount() {
    this.commentsCountText = '' + this.commentsCount + ' ' + Utils.chisl(this.commentsCount, ['комментарий', 'комментария', 'комментариев']);
  }

  private increaseCommentsCount() {
    this.commentsCount++;
    this.updateCommentsCount();
  }

  public setCommentsCount(val: number) {
    this.commentsCount = val;
    this.updateCommentsCount();
  }

}