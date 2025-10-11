import { Pipe, PipeTransform } from '@angular/core';
import Autolinker, { AutolinkerConfig, ReplaceFnReturn, UrlMatch } from 'autolinker';
import { Match } from "autolinker/dist/commonjs/match/match";
import { INewAttachment } from '../../../model/app-model';

@Pipe({ name: 'linky' })
export class LinkyPipe implements PipeTransform {
  transform(value: string, noPreviews = false, attachments: INewAttachment[] = []): string {
    if (!value) {
      return '';
    }

    // Создаём карту YouTube attachments для быстрого поиска
    const youtubeAttachmentsMap = new Map<string, INewAttachment>();
    attachments.forEach(att => {
      if (att.type === 'youtube' && att.source) {
        // Нормализуем URL для сравнения
        const normalizedSource = this.normalizeYouTubeUrl(att.source);
        if (normalizedSource) {
          youtubeAttachmentsMap.set(normalizedSource, att);
        }
      }
    });

    const config: AutolinkerConfig = {
      truncate: {
        length: 30,
        location: 'smart',
      },
      replaceFn: (match: Match): ReplaceFnReturn => {
        try {
          if (match instanceof UrlMatch) {
            const url = match.getUrl();
            
            // Проверяем, является ли это YouTube ссылкой
            const youtubeCode = this.getYouTubeCode(url);
            if (youtubeCode) {
              // Нормализуем текущий URL
              const normalizedUrl = this.normalizeYouTubeUrl(url);
              
              // Ищем соответствующий attachment
              const attachment = normalizedUrl ? youtubeAttachmentsMap.get(normalizedUrl) : null;
              
              if (attachment) {
                // Создаём кастомную ссылку: href на attachment, но текст - оригинальный YouTube URL
                const attachmentUrl = `#/attachment/${attachment.id}`;
                const displayText = match.getAnchorText();
                return `<a href="${attachmentUrl}" target="_blank" rel="noopener noreferrer">${displayText}</a>`;
              }
            }
            
            if (noPreviews) { // попросили не делать превьюшек
              return false; // false означает, что Autolinker создаст обычную ссылку
            }

            // YouTube ссылки теперь обрабатываются как обычные ссылки
            // (аттачменты создаются на бэкенде)
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
   * Нормализует YouTube URL для сравнения (приводит к единому формату)
   * @param url Ссылка на видео
   * @returns Нормализованный URL или null
   */
  private normalizeYouTubeUrl(url: string): string | null {
    const code = this.getYouTubeCode(url);
    if (!code) return null;
    
    // Приводим все YouTube URL к единому формату для сравнения
    return `youtube:${code}`;
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
