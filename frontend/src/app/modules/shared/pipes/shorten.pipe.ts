import { Pipe, PipeTransform } from '@angular/core';
import Autolinker, {AutolinkerConfig, ReplaceFnReturn, TruncateConfig} from 'autolinker';

@Pipe({ name: 'shorten' })
export class ShortenPipe implements PipeTransform {

  static maxLength = 220;
  static divider = ' … … … ';

  transform(value: string): string {
    if (value.length > ShortenPipe.maxLength + ShortenPipe.divider.length) {
      const half = Math.floor(ShortenPipe.maxLength / 2);
      const start = value.substring(0, half);
      const finish = value.substring(value.length - half, value.length);
      return `${start}${ShortenPipe.divider}${finish}`;
    } else {
      return value;
    }
  }
}
