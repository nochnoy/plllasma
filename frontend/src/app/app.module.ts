import {ErrorHandler, NgModule} from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from "@angular/common/http";
import { AppComponent } from './app.component';
import {FormsModule, ReactiveFormsModule} from "@angular/forms";
import {ScrollingModule} from "@angular/cdk/scrolling";
import { FocusListComponent } from './components/focus-list/focus-list.component';
import { ImageViewerComponent } from './components/image-viewer/image-viewer.component';
import {RouterModule} from "@angular/router";
import { DefaultPageComponent } from './pages/default-page/default-page.component';
import {AppRoutingModule} from "./app-routing.module";
import { LoginPageComponent } from './pages/login-page/login-page.component';
import { AppGuard } from './app.guard';
import { ChannelPageComponent } from './pages/channel-page/channel-page.component';
import { MainMenuComponent } from './components/main-menu/main-menu.component';
import { MessagesComponent } from './components/board/messages.component';
import { AsPipe } from './pipes/as.pipe';
import { MessageFormComponent } from './components/message-form/message-form.component';
import { TestMessagesPageComponent } from './pages/test-messages-page/test-messages-page.component';
import { LinkyPipe } from './pipes/linky.pipe';
import { NewlinePipe } from './pipes/newline.pipe';
import {LinksToStubsPipe} from "./pipes/links-to-stubs.pipe";
import {ShortenPipe} from "./pipes/shorten.pipe";
import {PlasmaDatePipe} from "./pipes/plasmadate.pipe";
import {ErrorService} from "./services/error.service";

@NgModule({
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    ScrollingModule,
    RouterModule,
    AppRoutingModule,
    ReactiveFormsModule,
  ],
  declarations: [
    AppComponent,
    FocusListComponent,
    ImageViewerComponent,
    DefaultPageComponent,
    LoginPageComponent,
    ChannelPageComponent,
    MainMenuComponent,
    MessagesComponent,
    AsPipe,
    MessageFormComponent,
    TestMessagesPageComponent,
    LinkyPipe,
    LinksToStubsPipe,
    ShortenPipe,
    PlasmaDatePipe,
    NewlinePipe,
  ],
  providers: [
    AppGuard,
    {provide: ErrorHandler, useClass: ErrorService},
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
