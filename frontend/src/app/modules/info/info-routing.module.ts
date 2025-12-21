import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GhostInfoComponent } from './pages/ghost-info/ghost-info.component';

const routes: Routes = [
  { path: 'ghost', component: GhostInfoComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class InfoRoutingModule { }
