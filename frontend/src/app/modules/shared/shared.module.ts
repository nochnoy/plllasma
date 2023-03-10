import { NgModule } from '@angular/core';
import {PlasmaDatePipe} from "./pipes/plasmadate.pipe";
import {AsPipe} from "./pipes/as.pipe";
import {LinkyPipe} from "./pipes/linky.pipe";
import {LinksToStubsPipe} from "./pipes/links-to-stubs.pipe";
import {ShortenPipe} from "./pipes/shorten.pipe";
import {NewlinePipe} from "./pipes/newline.pipe";
import {ContenteditableModel} from "./directives/content-editable-model";

@NgModule({
  declarations: [
    PlasmaDatePipe,
    AsPipe,
    LinkyPipe,
    LinksToStubsPipe,
    ShortenPipe,
    NewlinePipe,
    ContenteditableModel,
  ],
  exports: [
    PlasmaDatePipe,
    AsPipe,
    LinkyPipe,
    LinksToStubsPipe,
    ShortenPipe,
    NewlinePipe,
    ContenteditableModel,
  ],
})
export class SharedModule { }
