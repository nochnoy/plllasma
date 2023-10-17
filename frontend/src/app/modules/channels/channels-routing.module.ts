import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {ChannelsPageComponent} from "./pages/channels-page/channels-page.component";

const routes: Routes = [{ path: '', component: ChannelsPageComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ChannelsRoutingModule { }
