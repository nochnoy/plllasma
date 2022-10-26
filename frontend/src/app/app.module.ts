import { NgModule } from '@angular/core';
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
import { BoardComponent } from './components/board/board.component';
import { AsPipe } from './pipes/as.pipe';
import { MessageFormComponent } from './message-form/message-form.component';
import {LinkyModule} from "ngx-linky";

@NgModule({
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    ScrollingModule,
    RouterModule,
    AppRoutingModule,
    ReactiveFormsModule,
    LinkyModule
  ],
  declarations: [
    AppComponent,
    FocusListComponent,
    ImageViewerComponent,
    DefaultPageComponent,
    LoginPageComponent,
    ChannelPageComponent,
    MainMenuComponent,
    BoardComponent,
    AsPipe,
    MessageFormComponent,
  ],
  providers: [AppGuard],
  bootstrap: [AppComponent]
})
export class AppModule { }
