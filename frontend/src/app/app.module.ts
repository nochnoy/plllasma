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
import { MessagesComponent } from './components/messages/messages.component';
import { MessageFormComponent } from './components/message-form/message-form.component';
import { TestMessagesPageComponent } from './pages/test-messages-page/test-messages-page.component';
import {MainMenuComponent} from "./components/main-menu/main-menu.component";
import {SharedModule} from "./modules/shared/shared.module";
import { Channel2PageComponent } from './pages/channel2-page/channel2-page.component';
import { MozaicComponent } from './components/mozaic/mozaic.component';
import { SelectionComponent } from './components/selection/selection.component';

@NgModule({
    imports: [
      BrowserModule,
      HttpClientModule,
      FormsModule,
      ScrollingModule,
      RouterModule,
      AppRoutingModule,
      ReactiveFormsModule,
      MainMenuComponent,
      SharedModule
    ],
    declarations: [
      AppComponent,
      FocusListComponent,
      ImageViewerComponent,
      DefaultPageComponent,
      LoginPageComponent,
      ChannelPageComponent,
      MessagesComponent,
      MessageFormComponent,
      TestMessagesPageComponent,
      Channel2PageComponent,
      MozaicComponent,
      SelectionComponent,
    ],
    providers: [
      AppGuard,
      /*{provide: ErrorHandler, useClass: ErrorService},*/
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }
