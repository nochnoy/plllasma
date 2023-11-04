import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {ChannelsPageComponent} from "./pages/channels-page/channels-page.component";
import {ChannelCreationPageComponent} from "./pages/channel-creation-page/channel-creation-page.component";

const routes: Routes = [
  { path: '', component: ChannelsPageComponent },
  { path: 'new', component: ChannelCreationPageComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ChannelsRoutingModule { }
