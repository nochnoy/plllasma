import {Injectable} from '@angular/core';

/**
 * Праздничный календарь сайта — один на все страницы.
 *
 * Даты праздников жили копипастой в каждой странице (и уже разъезжались: каталог каналов
 * и страница канала встречали Хэллоуин в разные дни), теперь они здесь — одна копия,
 * которую читают и страницы, и компонент праздничных сообщений (`HolidayComponent`).
 */
@Injectable({
  providedIn: 'root'
})
export class HolidayService {

  /** Хэллоуин: с 11 октября по 6 ноября включительно. */
  isHalloween = false;

  /** Новый год: с 15 декабря по 10 января включительно (захватывает и январские каникулы). */
  isNewYear = false;

  constructor() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();

    const from = new Date(year, 10 - 1, 11);
    const to = new Date(year, 11 - 1, 6);
    this.isHalloween = now.getTime() >= from.getTime() && now.getTime() <= to.getTime();

    this.isNewYear = (month === 12 && date >= 15) || (month === 1 && date <= 10);
  }
}
