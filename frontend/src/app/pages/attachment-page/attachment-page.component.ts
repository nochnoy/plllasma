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
  isLoading = true;
  error = '';
  isImageMagnified = false;
  isInfoExpanded = false;

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
    this.isLoading = true;
    this.error = '';

    fetch(`/api/attachment-get.php?id=${this.attachmentId}`)
      .then(response => {
        return response.json();
      })
      .then(data => {
        if (data.success) {
          this.attachment = this.transformAttachment(data.attachment);
          this.handleAttachmentStatus();
          this.incrementViews();
        } else {
          console.error('AttachmentPageComponent: API returned error:', data.error);
          switch (data.error) {
            case 'access_denied':
              this.error = 'Нет доступа к аттачменту';
              break;
            case 'attachment_not_found':
              this.error = 'Аттачмент не найден';
              break;
            case 'message_not_found':
              this.error = 'Сообщение с этим аттачментом не найдено';
              break;
            default:
              this.error = `Ошибка: ${data.error || 'Неизвестная ошибка'}`;
          }
        }
        this.isLoading = false;
      })
      .catch((error) => {
        console.error('AttachmentPageComponent: API error:', error);
        this.error = 'Ошибка загрузки аттачмента';
        this.isLoading = false;
      });
  }

  private incrementViews(): void {
    if (!this.attachmentId) return;

    fetch(`/api/attachment-views-increment.php?id=${this.attachmentId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    }).catch(() => {
      // Игнорируем ошибки инкремента просмотров
    });
  }

  private handleAttachmentStatus(): void {
    if (this.attachment) {
      if (this.attachment.type === 'youtube' && this.attachment.source) {
        this.redirectToYouTube();
      }
    }
  }

  private redirectToYouTube(): void {
    if (!this.attachment || !this.attachment.source) return;
    window.location.href = this.attachment.source;
    this.incrementViews();
  }

  downloadFile(): void {
    if (this.attachment && this.attachment.type !== 'youtube') {

      const fileUrl = this.getFileDownloadUrl();
      const fileName = this.attachment.filename || 'download';

      if (!fileUrl) {
        console.error('Cannot download file: no file URL available');
        return;
      }

      // Создаем временную ссылку для скачивания
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = fileName;
      link.style.display = 'none';

      // Добавляем в DOM, кликаем и удаляем
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Инкрементируем счётчик скачиваний
      this.incrementDownloads();
    }
  }

  getFileDownloadUrl(): string {
    if (!this.attachment || !this.attachment.file || this.attachment.file <= 0 || !this.attachment.filename) {
      return '';
    }

    const id = this.attachment.id;
    const xx = id.substring(0, 2);
    const yy = id.substring(2, 4);
    const extension = this.attachment.filename.split('.').pop() || '';

    return `/attachments-new/${xx}/${yy}/${id}-${this.attachment.file}.${extension}`;
  }

  getPreviewUrl(): string {
    if (this.attachment && this.attachment.preview) {

    const id = this.attachment.id;
    const xx = id.substring(0, 2);
    const yy = id.substring(2, 4);

    return `/attachments-new/${xx}/${yy}/${id}-${this.attachment.preview}-p.jpg`;

    } else {
      return '';
    }
  }

  private incrementDownloads(): void {
    if (!this.attachmentId) return;

    // Отправляем запрос на инкремент скачиваний (не ждём ответа)
    fetch(`/api/attachment-downloads-increment.php?id=${this.attachmentId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    }).catch(() => {
      // Игнорируем ошибки инкремента скачиваний
    });
  }

  private transformAttachment(rawAttachment: any): INewAttachment {
    let type = rawAttachment.type;

    // Если тип пустой, определяем по расширению файла
    if (!type && rawAttachment.filename) {
      const extension = rawAttachment.filename.split('.').pop()?.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extension || '')) {
        type = 'image';
      } else if (['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'rm', 'rmvb', '3gp', 'm4v', 'mpg', 'mpeg'].includes(extension || '')) {
        type = 'video';
      } else {
        type = 'file';
      }
    }

    return {
      ...rawAttachment,
      type: type,
      icon: Number(rawAttachment.icon) || 0,
      preview: Number(rawAttachment.preview) || 0,
      file: Number(rawAttachment.file) || 0
    };
  }

  getAttachmentImageUrl(): string {
    if (!this.attachment) return '';

    const id = this.attachment.id;
    const xx = id.substring(0, 2);
    const yy = id.substring(2, 4);

    // Для изображений показываем оригинальный файл, если есть
    if (this.attachment.file && this.attachment.file > 0 && this.attachment.filename) {
      const extension = this.attachment.filename.split('.').pop() || '';
      return `/attachments-new/${xx}/${yy}/${id}-${this.attachment.file}.${extension}`;
    }

    // Если файла нет, но есть превью, используем превью
    if (this.attachment.preview && this.attachment.preview > 0) {
      return `/attachments-new/${xx}/${yy}/${id}-${this.attachment.preview}-p.jpg`;
    }

    return '';
  }

  getFileSize(): string {
    if (!this.attachment || !this.attachment.size) return 'Размер неизвестен';

    return this.formatFileSize(this.attachment.size);
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Б';

    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  canPlayVideo(): boolean {
    if (this.attachment && this.attachment.type === 'video' && this.attachment.filename) {

      const extension = this.attachment.filename.split('.').pop()?.toLowerCase();
      if (!extension) return false;

      // Создаем временный video элемент для проверки поддержки
      const video = document.createElement('video');

      // Маппинг расширений на MIME типы
      const mimeTypes: { [key: string]: string } = {
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'ogg': 'video/ogg',
        'avi': 'video/avi',
        'mov': 'video/quicktime',
        'wmv': 'video/x-ms-wmv',
        'flv': 'video/x-flv',
        'mkv': 'video/x-matroska',
        'm4v': 'video/x-m4v',
        'mpg': 'video/mpeg',
        'mpeg': 'video/mpeg',
        '3gp': 'video/3gpp',
        'rm': 'application/vnd.rn-realmedia',
        'rmvb': 'application/vnd.rn-realmedia-vbr'
      };

      const mimeType = mimeTypes[extension];
      return !!mimeType && ['probably', 'maybe'].includes(video.canPlayType(mimeType));
    }

    return false;
  }

  hasPreview(): boolean {
    return this.attachment?.type === 'video' &&
           this.attachment?.preview !== undefined &&
           this.attachment.preview > 0;
  }

  getPreviewBackgroundStyle(): string {
    if (!this.hasPreview() || !this.attachment) return '';

    const id = this.attachment.id;
    const xx = id.substring(0, 2);
    const yy = id.substring(2, 4);
    const previewUrl = `/attachments-new/${xx}/${yy}/${this.attachment.id}-${this.attachment.preview}-p.jpg`;

    return `url('${previewUrl}')`;
  }
}
