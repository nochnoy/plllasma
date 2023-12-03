import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-newyear',
  templateUrl: './newyear.component.html',
  styleUrls: ['./newyear.component.scss']
})
export class NewyearComponent implements OnInit {

  constructor() { }

  act = 0;

  ngOnInit(): void {
    setTimeout(() => this.act = 1, 1 * 1000);
    setTimeout(() => this.act = 2, 8 * 1000);
    setTimeout(() => this.act = 3, 14 * 1000);
    setTimeout(() => this.act = 4, 16 * 1000);
  }

}
