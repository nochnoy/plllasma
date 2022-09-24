import {CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree} from '@angular/router';
import {Injectable} from '@angular/core';
import {Observable, of} from "rxjs";
import {UserService} from "./services/user.service";

@Injectable({
  providedIn: 'root'
})
export class AppGuard implements CanActivate {

  constructor(
    private userService: UserService,
    private router: Router
  ) { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | Observable<UrlTree | boolean> {
    if (route.routeConfig?.path === 'login') {
      if (this.userService.isAuthorized) {
        return of (this.router.parseUrl(''));
      } else {
        return false;
      }
    } else {
      if (this.userService.isAuthorized) {
        return true;
      } else {
        return of(this.router.parseUrl('/login'));
      }
    }
  }
}
