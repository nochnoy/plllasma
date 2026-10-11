import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {HALLOWEEN_TEXT} from '../../model/app-model';
import {HolidayService} from '../../services/holiday.service';
import {NewyearComponent} from '../newyear/newyear.component';

/**
 * Праздничное сообщение в сайдбаре — ёлка на Новый год, тыква с текстом на Хэллоуин.
 *
 * Какой праздник на дворе, решает `HolidayService` — даты живут в одном месте, а не копией
 * в каждой странице. Страница ставит компонент в свой сайдбар и, если хочет одеть саму
 * панель под праздник (`sidebar-halloween` в `styles.scss`), читает тот же сервис.
 */
@Component({
  selector: 'app-holiday',
  standalone: true,
  imports: [CommonModule, NewyearComponent],
  templateUrl: './holiday.component.html',
})
export class HolidayComponent {

  readonly halloweenText = HALLOWEEN_TEXT;

  constructor(
    public holiday: HolidayService,
  ) { }
}
