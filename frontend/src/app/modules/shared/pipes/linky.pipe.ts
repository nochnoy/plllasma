import { Pipe, PipeTransform } from '@angular/core';
import Autolinker, {AutolinkerConfig, ReplaceFnReturn, TruncateConfig, UrlMatch} from 'autolinker';
import {Match} from "autolinker/dist/commonjs/match/match";

/**
 * Превращает URL'ы в ссылки а URL'ы видеороликов - в кликабельные превьюшки
 *
 */

@Pipe({ name: 'linky' })
export class LinkyPipe implements PipeTransform {
  transform(value: string, noPreviews = false): string {

    const config: AutolinkerConfig = {
      truncate: {
        length: 30,
        location: 'smart',
      },
      replaceFn: (match: Match): ReplaceFnReturn => {
        try {
          if (match instanceof UrlMatch) {
            const url = (match as UrlMatch).getUrl();
            if (noPreviews) { // попросили не делать превьюшек
              return false;
            } else {
              if (url.indexOf('youtu.be') > -1 || url?.indexOf('youtube') > -1) {
                const youTubeCode = this.getYouTubeCode(url);
                if (youTubeCode) {
                  console.log(youTubeCode);
                  return '<a class="youtube-link" href="' + url + '" target="_blank"><img class="preview" src="https://img.youtube.com/vi/' + youTubeCode + '/0.jpg" loading="lazy"></a>';
                } else {
                  return true;
                }
              } else {
                return true;
              }
            }
          }
        }
        catch(e) {
          return false;
        }
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
