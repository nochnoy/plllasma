import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AppGuard } from './app.guard';
import { DefaultPageComponent } from './pages/default-page/default-page.component';
import {LoginPageComponent} from "./pages/login-page/login-page.component";

const routes: Routes = [
  { path: '', redirectTo: 'default', pathMatch: 'full' },
  { path: 'login', component: LoginPageComponent },
  { path: 'default', component: DefaultPageComponent, canActivate: [AppGuard]},
  { path: '**', redirectTo: 'default', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule],
})
export class AppRoutingModule { }
