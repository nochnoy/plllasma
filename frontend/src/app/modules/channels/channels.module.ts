import { NgModule } from '@angular/core';
import {CommonModule, NgOptimizedImage} from '@angular/common';
import { ChannelsPageComponent } from './pages/channels-page/channels-page.component';
import { ChannelsRoutingModule } from './channels-routing.module';
import {MainMenuComponent} from "../../components/main-menu/main-menu.component";
import {SharedModule} from "../shared/shared.module";
import {FormsModule, ReactiveFormsModule} from "@angular/forms";
import { ChannelCreationPageComponent } from './pages/channel-creation-page/channel-creation-page.component';

@NgModule({
  declarations: [
    ChannelsPageComponent,
    ChannelCreationPageComponent
  ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,

        SharedModule,
        MainMenuComponent,
        ChannelsRoutingModule,
        NgOptimizedImage,
    ]
})
export class ChannelsModule { }
