import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MembersRoutingModule } from './members-routing.module';
import { MemberPageComponent } from './pages/member-page/member-page.component';
import { MembersPageComponent } from './pages/members-page/members-page.component';


@NgModule({
  declarations: [
    MemberPageComponent,
    MembersPageComponent
  ],
  imports: [
    CommonModule,
    MembersRoutingModule
  ]
})
export class MembersModule { }
