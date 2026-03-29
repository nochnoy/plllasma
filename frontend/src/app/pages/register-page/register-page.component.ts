import { Component } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { AppService } from '../../services/app.service';
import { merge } from 'rxjs';
import { tap } from 'rxjs/operators';

function registerPasswordsMatchValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get('password')?.value ?? '';
    const confirm = group.get('passwordConfirm')?.value ?? '';
    if (!password || !confirm) {
      return null;
    }
    return password === confirm ? null : { passwordMismatch: true };
  };
}

@UntilDestroy()
@Component({
  selector: 'app-register-page',
  templateUrl: './register-page.component.html',
  styleUrls: ['./register-page.component.scss'],
})
export class RegisterPageComponent {
  form = new FormGroup(
    {
      email: new FormControl('', [
        Validators.required,
        Validators.email,
        Validators.maxLength(80),
      ]),
      nick: new FormControl('', [Validators.required, Validators.maxLength(32)]),
      password: new FormControl('', [Validators.required, Validators.minLength(6)]),
      passwordConfirm: new FormControl('', [Validators.required]),
    },
    { validators: registerPasswordsMatchValidator() },
  );

  submitting = false;
  errorMessage = '';

  constructor(public appService: AppService) {
    const pwd = this.form.get('password');
    const conf = this.form.get('passwordConfirm');
    if (pwd && conf) {
      merge(pwd.valueChanges, conf.valueChanges)
        .pipe(untilDestroyed(this))
        .subscribe(() => this.form.updateValueAndValidity({ emitEvent: false }));
    }
  }

  private errorText(code: string): string {
    const map: Record<string, string> = {
      invalid_input: 'Заполните все поля.',
      invalid_email: 'Некорректный e-mail.',
      weak_password: 'Пароль не короче 6 символов.',
      login_long: 'Логин слишком длинный.',
      nick_long: 'Ник не длиннее 32 символов.',
      login_taken: 'Этот e-mail уже зарегистрирован.',
      nick_taken: 'Такой ник уже занят.',
      nick_reserved: 'Этот ник зарезервирован.',
      places: 'Регистрация временно недоступна.',
      server: 'Ошибка сервера, попробуйте позже.',
    };
    return map[code] ?? 'Не удалось зарегистрироваться.';
  }

  onSubmit(): void {
    this.errorMessage = '';
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.errorMessage = 'Проверьте поля формы.';
      return;
    }

    this.submitting = true;
    this.form.disable();

    const v = this.form.getRawValue();
    this.appService
      .register$(v.email ?? '', v.password ?? '', v.nick ?? '')
      .pipe(
        tap((r) => {
          this.submitting = false;
          this.form.enable();
          if (!r.ok) {
            this.errorMessage = this.errorText(r.error ?? '');
          }
        }),
        untilDestroyed(this),
      )
      .subscribe();
  }
}
