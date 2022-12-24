import { Pipe, PipeTransform } from '@angular/core';
import Autolinker, {AutolinkerConfig, ReplaceFnReturn, TruncateConfig, UrlMatch} from 'autolinker';
import {Match} from "autolinker/dist/commonjs/match/match";

@Pipe({ name: 'linky' })
export class LinkyPipe implements PipeTransform {
  transform(value: string): string {

    const config: AutolinkerConfig = {
      truncate: {
        length: 30,
        location: 'smart',
      },
      replaceFn: (match: Match): ReplaceFnReturn => {
        const url = (match as UrlMatch)?.getUrl();
        /*if (url?.indexOf('youtu.be') > -1 || url?.indexOf('youtube') > -1) {
          const youTubeCode = this.getYouTubeCode(url);
          if (youTubeCode) {
            console.log(youTubeCode);
            return '<br><a href="' + url + '" target="_blank"><img class="preview" src="http://img.youtube.com/vi/' + youTubeCode + '/0.jpg" loading="lazy"></a>';
          } else {
            return true;
          }
        } else {*/
          return true;
        /*}*/
      }
    }

    return Autolinker.link(value, config);
  }

  getYouTubeCode(url: string): string | false {
    let regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    let m = url.match(regExp);
    if (m && m[2].length == 11) {
      return m[2];
    } else {
      return false; // Пусть выдаст как ссылку
    }
  }
}
