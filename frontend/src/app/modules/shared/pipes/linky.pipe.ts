import { Pipe, PipeTransform } from '@angular/core';
import Autolinker, { AutolinkerConfig, ReplaceFnReturn, UrlMatch } from 'autolinker';
import { Match } from "autolinker/dist/commonjs/match/match";

@Pipe({ name: 'linky' })
export class LinkyPipe implements PipeTransform {
  transform(value: string, noPreviews = false): string {
    if (!value) {
      return '';
    }

    const config: AutolinkerConfig = {
      truncate: {
        length: 30,
        location: 'smart',
      },
      replaceFn: (match: Match): ReplaceFnReturn => {
        try {
          if (match instanceof UrlMatch) {
            const url = match.getUrl();
            if (noPreviews) { // попросили не делать превьюшек
              return false; // false означает, что Autolinker создаст обычную ссылку
            }

            // Проверяем, является ли ссылка YouTube-ссылкой (любого типа)
            if (url.includes('youtu.be') || url.includes('youtube.com')) {
              const youTubeCode = this.getYouTubeCode(url);
              if (youTubeCode) {
                // Если код видео найден, возвращаем нашу кастомную HTML-разметку
                return `<a class="youtube-link" href="${url}" target="_blank" rel="noopener noreferrer"><img class="video-preview" src="https://img.youtube.com/vi/${youTubeCode}/0.jpg" loading="lazy" alt=""></a>`;
              }
            }
            // Для всех остальных URL или если код YouTube не найден,
            // Autolinker создаст обычную ссылку
            return true;
          }
        } catch (e) {
          console.error('Error in LinkyPipe replaceFn', e);
          return false; // В случае ошибки, пусть будет обычная ссылка
        }
        return false;
      }
    };

    return Autolinker.link(value, config);
  }

  /**
   * Извлекает 11-значный код видео из любого формата URL YouTube
   * @param url Ссылка на видео
   * @returns Код видео или false
   */
  getYouTubeCode(url: string): string | false {
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const m = url.match(regExp);

    if (m && m[2] && m[2].length === 11) {
      return m[2];
    } else {
      return false;
    }
  }
}
