import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { INewAttachment } from '../../model/app-model';

@Component({
  selector: 'app-attachment-list',
  templateUrl: './attachment-list.component.html',
  styleUrls: ['./attachment-list.component.scss']
})
export class AttachmentListComponent implements OnInit {
  @Input() attachments: INewAttachment[] = [];
  @Input() placeId: number = 0;

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Данные уже есть, загрузка не нужна
  }

  onAttachmentClick(attachment: INewAttachment): void {
    if (attachment) {
      const url = this.router.serializeUrl(this.router.createUrlTree(['/attachment', attachment.id]));
      const fullUrl = window.location.origin + '/#' + url;
      window.open(fullUrl, '_blank');
    }
  }

  getAttachmentTitle(attachment: INewAttachment): string {
    if (!attachment) return '';

    switch (attachment.type) {
      case 'youtube':
        return 'YouTube видео';
      case 'image':
        return 'Изображение';
      case 'video':
        return 'Видео';
      case 'file':
        return attachment.filename || 'Файл';
      default:
        return attachment.filename || 'Вложение';
    }
  }

  getStatusText(attachment: INewAttachment): string {
    if (attachment.status === 'pending') {
      return ' (обрабатывается)';
    }
    return '';
  }
}


