import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MembersRoutingModule } from './members-routing.module';
import { MemberPageComponent } from './pages/member-page/member-page.component';
import { MembersPageComponent } from './pages/members-page/members-page.component';
import {MainMenuComponent} from "../../components/main-menu/main-menu.component";
import {SharedModule} from "../shared/shared.module";

@NgModule({
  declarations: [
    MemberPageComponent,
    MembersPageComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    MembersRoutingModule,
    MainMenuComponent
  ]
})
export class MembersModule { }
