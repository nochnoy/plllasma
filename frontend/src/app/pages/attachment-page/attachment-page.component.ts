import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { INewAttachment } from '../../model/app-model';

@Component({
  selector: 'app-attachment-page',
  templateUrl: './attachment-page.component.html',
  styleUrls: ['./attachment-page.component.scss']
})
export class AttachmentPageComponent implements OnInit {
  attachmentId: string = '';
  attachment?: INewAttachment;
  loading = true;
  error = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.attachmentId = params['id'];
      this.loadAttachment();
    });
  }

  private loadAttachment(): void {
    this.loading = true;
    this.error = '';

    fetch(`/api/attachment-get.php?id=${this.attachmentId}`)
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          this.attachment = this.transformAttachment(data.attachment);
          this.handleAttachmentStatus();
        } else {
          this.error = 'Аттачмент не найден';
        }
        this.loading = false;
      })
      .catch(() => {
        this.error = 'Ошибка загрузки аттачмента';
        this.loading = false;
      });
  }

  private handleAttachmentStatus(): void {
    if (!this.attachment) return;

    switch (this.attachment.status) {
      case 'pending':
        // Редиректим на YouTube
        if (this.attachment.type === 'youtube' && this.attachment.source) {
          window.open(this.attachment.source, '_blank');
          this.router.navigate(['/']);
        }
        break;
      case 'ready':
        // Показываем контент
        break;
      case 'rejected':
        // Показываем сообщение об ошибке обработки
        break;
      case 'unavailable':
        // Показываем сообщение о недоступности
        break;
    }
  }

  onBackClick(): void {
    this.router.navigate(['/']);
  }

  private transformAttachment(rawAttachment: any): INewAttachment {
    return {
      ...rawAttachment,
      icon: Boolean(rawAttachment.icon),
      preview: Boolean(rawAttachment.preview)
    };
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
    
    // Иначе возвращаем стандартные иконки по типу
    switch (this.attachment.type) {
      case 'youtube':
        return '/api/images/attachment-icons/video.png';
      case 'image':
        return '/api/images/attachment-icons/image.png';
      case 'video':
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
}
