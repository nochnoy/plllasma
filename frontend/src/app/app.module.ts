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
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
