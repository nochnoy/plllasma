import { NgModule } from '@angular/core';
import {CommonModule} from "@angular/common";
import {RouterModule} from "@angular/router";
import {FormsModule} from "@angular/forms";
import {PlasmaDatePipe} from "./pipes/plasmadate.pipe";
import {AsPipe} from "./pipes/as.pipe";
import {LinkyPipe} from "./pipes/linky.pipe";
import {LinksToStubsPipe} from "./pipes/links-to-stubs.pipe";
import {ShortenPipe} from "./pipes/shorten.pipe";
import {NewlinePipe} from "./pipes/newline.pipe";
import {SafePipe} from "./pipes/safe.pipe";
import {ContenteditableValueAccessor} from "./directives/contenteditable-value-accessor";
import {ChannelsListComponent} from "../../components/channels-list/channels-list.component";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
  ],
  declarations: [
    PlasmaDatePipe,
    AsPipe,
    LinkyPipe,
    LinksToStubsPipe,
    ShortenPipe,
    NewlinePipe,
    SafePipe,
    ContenteditableValueAccessor,
    ChannelsListComponent,
  ],
  exports: [
    PlasmaDatePipe,
    AsPipe,
    LinkyPipe,
    LinksToStubsPipe,
    ShortenPipe,
    NewlinePipe,
    SafePipe,
    ContenteditableValueAccessor,
    ChannelsListComponent,
  ],
})
export class SharedModule { }
