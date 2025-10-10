import { NgModule } from '@angular/core';
import {PlasmaDatePipe} from "./pipes/plasmadate.pipe";
import {AsPipe} from "./pipes/as.pipe";
import {LinkyPipe} from "./pipes/linky.pipe";
import {LinksToStubsPipe} from "./pipes/links-to-stubs.pipe";
import {ShortenPipe} from "./pipes/shorten.pipe";
import {NewlinePipe} from "./pipes/newline.pipe";
import {SafePipe} from "./pipes/safe.pipe";
import {ContenteditableValueAccessor} from "./directives/contenteditable-value-accessor";

@NgModule({
  declarations: [
    PlasmaDatePipe,
    AsPipe,
    LinkyPipe,
    LinksToStubsPipe,
    ShortenPipe,
    NewlinePipe,
    SafePipe,
    ContenteditableValueAccessor,
  ],
  exports: [
    PlasmaDatePipe,
    AsPipe,
    LinkyPipe,
    LinksToStubsPipe,
    ShortenPipe,
    NewlinePipe,
    SafePipe,
    ContenteditableValueAccessor
  ],
})
export class SharedModule { }
