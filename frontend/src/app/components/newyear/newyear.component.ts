import { Component, OnInit } from '@angular/core';
import {of} from "rxjs";
import {delay, tap} from "rxjs/operators";

@Component({
  selector: 'app-newyear',
  templateUrl: './newyear.component.html',
  styleUrls: ['./newyear.component.scss']
})
export class NewyearComponent implements OnInit {

  constructor() { }

  act = 0;

  ngOnInit(): void {
    of({}).pipe(
      delay(1000 * 3),  tap(() => this.act = 1), // боковая панель мигает
      delay(1000 * 2.1),  tap(() => this.act = 2), // открывается дверь, появляется Вейдер
      delay(1000 * 4),  tap(() => this.act = 3), // Вейдер превращается в ёлку
      delay(1000 * 3),  tap(() => this.act = 4),
    ).subscribe();
  }

}
