import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AppGuard } from './app.guard';
import { ChannelPageComponent } from './pages/channel-page/channel-page.component';
import {LoginPageComponent} from "./pages/login-page/login-page.component";
import {TestMessagesPageComponent} from "./pages/test-messages-page/test-messages-page.component";

const routes: Routes = [
  { path: '', component: ChannelPageComponent, canActivate: [AppGuard] },
  { path: 'login', component: LoginPageComponent },
  { path: 'test-messages', component: TestMessagesPageComponent },
  {
    path: 'channel',
    children: [
      {path: '', component: ChannelPageComponent, canActivate: [AppGuard]},
      {path: '**', component: ChannelPageComponent, canActivate: [AppGuard]},
    ]
  },
  { path: '**', redirectTo: '', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule],
})
export class AppRoutingModule { }
