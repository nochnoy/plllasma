import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AppGuard } from './app.guard';
import { ChannelPageComponent } from './pages/channel-page/channel-page.component';
import { LoginPageComponent } from "./pages/login-page/login-page.component";
import { TestMessagesPageComponent } from "./pages/test-messages-page/test-messages-page.component";

const routes: Routes = [
  { path: '', redirectTo: 'channel/1', pathMatch: 'full' },
  { path: 'login', component: LoginPageComponent },
  { path: 'test-messages', component: TestMessagesPageComponent },
  {
    path: 'channel',
    children: [
      {path: '', component: ChannelPageComponent, canActivate: [AppGuard]},
      {path: '**', component: ChannelPageComponent, canActivate: [AppGuard]},
    ]
  },
  { path: 'channels', loadChildren: () => import('./modules/channels/channels.module').then(m => m.ChannelsModule) },
  { path: 'members', loadChildren: () => import('./modules/members/members.module').then(m => m.MembersModule) },
  { path: 'about', loadChildren: () => import('./modules/about/about.module').then(m => m.AboutModule) },
  { path: 'settings', loadChildren: () => import('./modules/settings/settings.module').then(m => m.SettingsModule) },
  { path: '**', redirectTo: '', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true, scrollPositionRestoration: 'enabled' })],
  exports: [RouterModule],
})
export class AppRoutingModule { }
