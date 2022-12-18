import { Pipe, PipeTransform } from '@angular/core';
import Autolinker, {AutolinkerConfig, ReplaceFnReturn, TruncateConfig} from 'autolinker';

@Pipe({ name: 'linksToStubs' })
export class LinksToStubsPipe implements PipeTransform {
  transform(value: string): string {
    return value.replace(/<a\s[^>]*href\s*=\s*"[^"]*"[^>]*>/g, '');
  }
}
