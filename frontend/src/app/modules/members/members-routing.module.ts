import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {MembersPageComponent} from "./pages/members-page/members-page.component";
import {MemberPageComponent} from "./pages/member-page/member-page.component";

const routes: Routes = [
  {
    path: '',
    children: [
      {path: '', component: MembersPageComponent},
      {path: '**', component: MemberPageComponent},
    ]
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MembersRoutingModule { }
