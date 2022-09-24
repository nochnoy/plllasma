import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { DefaultPageComponent } from './pages/default-page/default-page.component';
import {LoginPageComponent} from "./pages/login-page/login-page.component";

const routes: Routes = [
  { path: '', component: DefaultPageComponent },
  { path: 'login', component: LoginPageComponent },
  { path: 'default', component: DefaultPageComponent },
  { path: '**', redirectTo: 'default' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule],
})
export class AppRoutingModule {
}
