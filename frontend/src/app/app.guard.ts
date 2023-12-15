import { ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import {Injectable} from '@angular/core';
import {Observable, of} from "rxjs";
import {UserService} from "./services/user.service";
import { filter, map } from 'rxjs/operators';
import { LoginStatus } from './model/app-model';

@Injectable({
  providedIn: 'root'
})
export class AppGuard  {

  constructor(
    private userService: UserService,
    private router: Router
  ) { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<UrlTree | boolean> {
    return this.userService.loginStatus$.pipe(
      filter((status) => status !== LoginStatus.authorising),
      map((status) => {
        if (status === LoginStatus.authorised) {
          return true;
        } else {
          return this.router.parseUrl('/login');
        }
      })
    );
  }
}
