import { Pipe, PipeTransform } from '@angular/core';
import Autolinker, {AutolinkerConfig, ReplaceFnReturn, TruncateConfig} from 'autolinker';

@Pipe({ name: 'linky' })
export class LinkyPipe implements PipeTransform {
  transform(value: string): string {

    const config: AutolinkerConfig = {
      truncate: {
        length: 30,
        location: 'smart',
      }
    }

    return Autolinker.link(value, config);
  }
}
