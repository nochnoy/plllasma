import { NgModule } from '@angular/core';
import {PlasmaDatePipe} from "../../pipes/plasmadate.pipe";

@NgModule({
  declarations: [
    PlasmaDatePipe
  ],
  exports: [
    PlasmaDatePipe
  ],
})
export class SharedModule { }
