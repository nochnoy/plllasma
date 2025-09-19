import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { INewAttachment } from '../../model/app-model';

@Component({
  selector: 'app-attachment-item',
  templateUrl: './attachment-item.component.html',
  styleUrls: ['./attachment-item.component.scss']
})
export class AttachmentItemComponent implements OnInit {
  @Input() attachment: INewAttachment | null = null;
  @Input() placeId: number = 0;

  loading = false;
  error = '';

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Данные уже есть, загрузка не нужна
  }

  ngOnChanges(): void {
    // Данные уже есть, загрузка не нужна
  }

  onAttachmentClick(): void {
    if (this.attachment) {
      // Для всех типов аттачментов открываем страницу аттачмента в новом табе
      const url = this.router.serializeUrl(this.router.createUrlTree(['/attachment', this.attachment.id]));
      // Добавляем hash для правильного роутинга
      const fullUrl = window.location.origin + '/#' + url;
      console.log('Full URL with hash:', fullUrl);
      window.open(fullUrl, '_blank');
    }
  }

  onImageError(event: Event): void {
    // При ошибке загрузки изображения заменяем на дефолтную иконку
    const img = event.target as HTMLImageElement;

    if (this.attachment) {
      switch (this.attachment.type) {
        case 'image':
          img.src = '/api/images/attachment-icons/image.png';
          break;
        case 'video':
        case 'youtube':
          img.src = '/api/images/attachment-icons/video.png';
          break;
        case 'file':
        default:
          img.src = '/api/images/attachment-icons/file.png';
          break;
      }
    } else {
      // Fallback на черный прямоугольник
      img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMDAwMDAwIi8+Cjwvc3ZnPgo=';
    }
  }

  getAttachmentIcon(): string {
    if (!this.attachment) return '';

    const id = this.attachment.id || '';
    const xx = id.substring(0, 2);
    const yy = id.substring(2, 4);

    // Если есть иконка (версия > 0), строим путь с версией
    if (this.attachment.icon && this.attachment.icon > 0) {
      return `/attachments-new/${xx}/${yy}/${this.attachment.id}-${this.attachment.icon}-i.jpg`;
    }

    // Для аттачментов без иконок используем дефолтные иконки
    return this.getDefaultIcon();
  }

  private getDefaultIcon(): string {
    if (!this.attachment) return '';

    switch (this.attachment.type) {
      case 'image':
        return '/api/images/attachment-icons/image.png';
      case 'video':
        return '/api/images/attachment-icons/video.png';
      case 'youtube':
        return '/api/images/attachment-icons/video.png';
      case 'file':
      default:
        return '/api/images/attachment-icons/file.png';
    }
  }

  getAttachmentTitle(): string {
    if (!this.attachment) return '';

    switch (this.attachment.type) {
      case 'youtube':
        return 'YouTube видео';
      case 'image':
        return 'Изображение';
      case 'video':
        return 'Видео';
      case 'file':
        return 'Файл';
      default:
        return 'Вложение';
    }
  }

  isVideoAttachment(): boolean {
    return this.attachment?.type === 'video' || this.attachment?.type === 'youtube';
  }
}
