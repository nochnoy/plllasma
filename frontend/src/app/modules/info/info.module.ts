import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { InfoRoutingModule } from './info-routing.module';
import { GhostInfoComponent } from './pages/ghost-info/ghost-info.component';
import { MainMenuComponent } from '../../components/main-menu/main-menu.component';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  declarations: [
    GhostInfoComponent
  ],
  imports: [
    CommonModule,
    RouterModule,
    InfoRoutingModule,
    SharedModule,
    MainMenuComponent
  ]
})
export class InfoModule { }
