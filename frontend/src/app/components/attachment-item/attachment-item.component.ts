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
      this.router.navigate(['/attachment', this.attachment.id]);
    }
  }

  onImageError(event: Event): void {
    // При ошибке загрузки изображения заменяем на черный прямоугольник
    const img = event.target as HTMLImageElement;
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMDAwMDAwIi8+Cjwvc3ZnPgo=';
  }

  getAttachmentIcon(): string {
    if (!this.attachment) return '';
    
    // Если есть иконка, составляем путь к файлу иконки
    if (this.attachment.icon) {
      const xx = this.attachment.id.substring(0, 2);
      const yy = this.attachment.id.substring(2, 4);
      return `attachments-new/${xx}/${yy}/${this.attachment.id}-i.jpg`;
    }
    
    // Если есть превьюшка, составляем путь к файлу превьюшки
    if (this.attachment.preview) {
      const xx = this.attachment.id.substring(0, 2);
      const yy = this.attachment.id.substring(2, 4);
      return `attachments-new/${xx}/${yy}/${this.attachment.id}-p.jpg`;
    }
    
    // Иначе возвращаем путь к черному прямоугольнику
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMDAwMDAwIi8+Cjwvc3ZnPgo=';
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

  getStatusText(): string {
    if (!this.attachment) return '';
    
    switch (this.attachment.status) {
      case 'pending':
        return 'Обрабатывается...';
      case 'unavailable':
        return 'Недоступно';
      case 'rejected':
        return 'Ошибка обработки';
      case 'ready':
        return '';
      default:
        return '';
    }
  }
}
