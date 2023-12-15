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
import {ChannelPageComponent, DialogDataExampleDialog} from './pages/channel-page/channel-page.component';
import { MessagesComponent } from './components/messages/messages.component';
import { TestMessagesPageComponent } from './pages/test-messages-page/test-messages-page.component';
import {MainMenuComponent} from "./components/main-menu/main-menu.component";
import {SharedModule} from "./modules/shared/shared.module";
import { MatrixComponent } from './components/matrix/matrix.component';
import { SelectionComponent } from './components/selection/selection.component';
import {MessageForm2Component} from "./components/message-form-2/message-form-2.component";
import {MatMenuModule} from "@angular/material/menu";
import {MatButtonModule} from "@angular/material/button";
import {NoopAnimationsModule} from "@angular/platform-browser/animations";
import {MatDialogModule} from "@angular/material/dialog";
import { NewyearComponent } from './components/newyear/newyear.component';

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
    SharedModule,
    MatMenuModule,
    MatButtonModule,
    NoopAnimationsModule,
    MatDialogModule,
  ],
    declarations: [
      AppComponent,
      FocusListComponent,
      ImageViewerComponent,
      DefaultPageComponent,
      LoginPageComponent,
      ChannelPageComponent,
      MessagesComponent,
      MessageForm2Component,
      TestMessagesPageComponent,
      MatrixComponent,
      SelectionComponent,
      DialogDataExampleDialog,
      NewyearComponent
    ],
    providers: [
      AppGuard,
      /*{provide: ErrorHandler, useClass: ErrorService},*/
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }
