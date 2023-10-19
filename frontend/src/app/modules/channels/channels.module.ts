import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChannelsPageComponent } from './pages/channels-page/channels-page.component';
import { ChannelsRoutingModule } from './channels-routing.module';
import {MainMenuComponent} from "../../components/main-menu/main-menu.component";
import {SharedModule} from "../shared/shared.module";
import {FormsModule, ReactiveFormsModule} from "@angular/forms";

@NgModule({
  declarations: [
    ChannelsPageComponent
  ],
  imports: [
    CommonModule,
    FormsModule, 
    ReactiveFormsModule,

    SharedModule,
    MainMenuComponent,
    ChannelsRoutingModule,
  ]
})
export class ChannelsModule { }
