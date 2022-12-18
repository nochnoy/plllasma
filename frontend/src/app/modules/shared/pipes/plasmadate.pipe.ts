import {Pipe, PipeTransform} from '@angular/core';

@Pipe({name: 'plasmadate'})
export class PlasmaDatePipe implements PipeTransform {
  transform(value: string): string {
    let d = new Date(value);
    return this.showTime(d);
  }

  showTime(dateObj: Date): string {
    var monthsArr = ["Января", "Февраля", "Марта", "Апреля", "Мая", "Июня",
      "Июля", "Августа", "Сентября", "Октября", "Ноября", "Декабря"];

    var daysArr = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

    var year = dateObj.getFullYear();
    var month = dateObj.getMonth();
    var numDay = dateObj.getDate();
    var day = dateObj.getDay();
    var hour = dateObj.getHours();
    var minute = dateObj.getMinutes();
    var second = dateObj.getSeconds();

    const result =
      daysArr[day] + ', ' + numDay + " " + monthsArr[month]
      + " " + year + ', ' + hour + ":" +
      ((minute < 10) ? "0" + minute : minute + '')
      + ":" +
      ((second < 10) ? "0" + second : second + '');

    return result;
  }
}
