import {Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, ViewChild, AfterViewInit, OnDestroy} from '@angular/core';
import {AppService} from "../../services/app.service";
import {tap, switchMap} from "rxjs/operators";
import {of, Observable, Subscription} from "rxjs";
import {IUploadingAttachment} from "../../model/app-model";
import {Utils} from "../../utils/utils";
import {Const} from "../../model/const";
import {Message} from "../../model/messages/message.model";
import {UserService} from "../../services/user.service";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {ChannelService} from "../../services/channel.service";
import {UploadService} from "../../services/upload.service";
import {ChunkedUploadService} from "../../services/chunked-upload.service";

@UntilDestroy()
@Component({
  selector: 'app-message-form',
  templateUrl: './message-form.component.html',
  styleUrls: ['./message-form.component.scss']
})
export class MessageFormComponent implements OnInit, AfterViewInit, OnDestroy {

  constructor(
    public appService: AppService,
    public userService: UserService,
    public channelService: ChannelService,
    public uploadService: UploadService,
    public chunkedUploadService: ChunkedUploadService,
  ) { }

  @ViewChild('textarea') textarea?: ElementRef;
  @Input('channelId') channelId!: number;
  @Input('parentMessage') parentMessage?: Message;
  @Input('replyMode') replyMode: boolean = false;
  @Output('onPost') onNewMessageCreated = new EventEmitter<string>();
  messageText: string = '';
  attachments: IUploadingAttachment[] = [];
  isGhost = false;
  isDragging = false;
  isSending = false;
  isUploading = false;
  userName = '';
  userIcon = '';
  uploadError: string = ''; // Сообщение об ошибке загрузки
  
  // ID черновика — сохраняется между попытками отправки (public для шаблона)
  draftMessageId: number | null = null;
  private uploadSubscriptions: Map<string, Subscription> = new Map();

  ngOnInit() {
    this.userName = this.userService.user.nick ?? '';
    this.userIcon = this.userService.user.icon + '.gif';
    setTimeout(() => {
      if (this.replyMode) {
      this.textarea?.nativeElement?.focus()
      }
    }, 500);
  }

  ngAfterViewInit(): void {
    // Вызываем изменение высоты при изменении текста
    this.adjustTextareaHeight();
  }

  ngOnDestroy(): void {
    // Отписываемся от всех загрузок
    this.uploadSubscriptions.forEach(sub => sub.unsubscribe());
    this.uploadSubscriptions.clear();
    
    // Удаляем черновик если он есть
    if (this.draftMessageId) {
      this.appService.deleteMessage$(this.draftMessageId).subscribe();
      this.draftMessageId = null;
    }
  }

  // Предупреждение при уходе со страницы во время загрузки
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): string | undefined {
    if (this.isUploading || this.chunkedUploadService.hasActiveUploads()) {
      event.preventDefault();
      event.returnValue = 'Загрузка файлов ещё не завершена. Вы уверены, что хотите уйти?';
      return event.returnValue;
    }
    return undefined;
  }

  addAttachments(files: File[]) {
    // Сбрасываем ошибку при добавлении новых файлов
    this.uploadError = '';
    
    // Проверяем размер файлов ДО добавления
    const tooBigFiles: string[] = [];
    const validFiles = files.filter(file => {
      if (Utils.bytesToMegabytes(file.size) > Const.maxFileUploadSizeMb) {
        tooBigFiles.push(file.name);
        return false;
      }
      return true;
    });
    
    // Показываем alert для слишком больших файлов
    if (tooBigFiles.length > 0) {
      const maxSize = Const.maxFileUploadSizeMb >= 1024 
        ? `${Const.maxFileUploadSizeMb / 1024} ГБ` 
        : `${Const.maxFileUploadSizeMb} МБ`;
      alert(`Файл${tooBigFiles.length > 1 ? 'ы' : ''} превыша${tooBigFiles.length > 1 ? 'ют' : 'ет'} лимит ${maxSize}:\n\n${tooBigFiles.join('\n')}`);
    }
    
    // Если нет валидных файлов — выходим
    if (validFiles.length === 0) {
      return;
    }
    
    const newAttachments: IUploadingAttachment[] = validFiles.map((file) => {
      return {
        file: file,
        name: file.name,
        isImage: file?.type?.split('/')[0] === 'image',
        isReady: false,
        isChunked: true, // Все файлы загружаются через multipart
        progress: 0,
        uploadStatus: 'pending'
      } as IUploadingAttachment;
    });
    
    const checkAttachmentsReady = () => {
      if (!newAttachments.some((attachment) => !attachment || !attachment.isReady)) {
        this.attachments = [...this.attachments, ...newAttachments];
      }
    }
    
    newAttachments.forEach((attachment: IUploadingAttachment) => {
      if (attachment.isImage) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          attachment.bitmap = e.target.result;
          attachment.isReady = true;
          checkAttachmentsReady();
        };
        reader.readAsDataURL(attachment.file);
      } else {
        attachment.isReady = true;
        checkAttachmentsReady();
      }
    })
  }

  onCancelEditClick(event: any): void {
    event.preventDefault();
    this.channelService.cancelMessageReply();
  }

  onSendClick(): void {
    const cleanedText = this.cleanMessageText(this.messageText);
    if (cleanedText || this.attachments.length) {
      // Проверяем, что нет активных загрузок
      if (this.isUploading) {
        return;
      }
      
      // Сбрасываем ошибку
      this.uploadError = '';
      this.isSending = true;
      
      // Файлы без ошибок, которые ещё не загружены
      const pendingAttachments = this.attachments.filter(a => !a.error && a.uploadStatus !== 'completed');
      // Все файлы без ошибок
      const validAttachments = this.attachments.filter(a => !a.error);
      
      // Если есть файлы для загрузки
      if (pendingAttachments.length > 0) {
        this.isUploading = true;
        
        // Создаём черновик только если его ещё нет
        const createOrUseDraft$ = this.draftMessageId 
          ? of({ messageId: this.draftMessageId })
          : this.appService.addMessage$(this.channelId, '', this.parentMessage?.id || 0, this.isGhost, [], true);
        
        createOrUseDraft$.pipe(
          switchMap((result: any) => {
            const messageId = result.messageId;
            this.draftMessageId = messageId; // Сохраняем ID черновика
            
            // Загружаем только те файлы, которые ещё не загружены
            const uploadPromises = pendingAttachments.map(attachment => {
              return new Promise<void>((resolve, reject) => {
                const sub = this.chunkedUploadService.startUpload(
                  attachment.file, 
                  this.channelId, 
                  messageId
                ).subscribe({
                  next: (state) => {
                    attachment.uploadId = state.uploadId;
                    attachment.progress = state.progress;
                    attachment.uploadStatus = state.status;
                    this.updateUploadingState();
                  },
                  error: (err: Error) => {
                    attachment.uploadStatus = 'error';
                    attachment.error = err.message || 'Ошибка загрузки';
                    this.updateUploadingState();
                    reject(new Error(`${attachment.name}: ${attachment.error}`));
                  },
                  complete: () => {
                    this.updateUploadingState();
                    if (attachment.uploadStatus === 'completed' && !attachment.error) {
                      resolve();
                    } else {
                      reject(new Error(`${attachment.name}: ${attachment.error || 'Ошибка загрузки'}`));
                    }
                  }
                });
                
                // Сохраняем подписку после получения uploadId
                const checkAndSave = setInterval(() => {
                  if (attachment.uploadId) {
                    this.uploadSubscriptions.set(attachment.uploadId, sub);
                    clearInterval(checkAndSave);
                  }
                }, 50);
              });
            });
            
            return new Observable(observer => {
              Promise.all(uploadPromises)
                .then(() => {
                  // Все файлы загружены успешно — публикуем черновик
                  this.appService.editMessage$(messageId, cleanedText, this.channelId).subscribe({
                    next: () => {
                      observer.next({ messageId });
                      observer.complete();
                    },
                    error: () => {
                      observer.error(new Error('Не удалось опубликовать сообщение'));
                    }
                  });
                })
                .catch((err: Error) => {
                  observer.error(err);
                });
            });
          }),
          tap((result: any) => {
            // Успешная публикация — очищаем всё
            this.isSending = false;
            this.attachments.length = 0;
            this.uploadSubscriptions.forEach(sub => sub.unsubscribe());
            this.uploadSubscriptions.clear();
            this.isUploading = false;
            this.messageText = '';
            this.draftMessageId = null; // Очищаем черновик
            this.uploadError = '';
            setTimeout(() => {
              this.adjustTextareaHeight();
            }, 0);
            if (this.channelService.selectedMessage) {
              this.channelService.selectedMessage.canDeselect = true;
              this.channelService.deselectMessage();
            }
            this.onNewMessageCreated.emit(cleanedText);
          }),
          untilDestroyed(this)
        ).subscribe({
          error: (err) => {
            // Ошибка — НЕ удаляем черновик, показываем ошибку пользователю
            this.isSending = false;
            this.isUploading = false;
            this.updateUploadingState();
            this.uploadError = err.message || 'Ошибка загрузки файлов';
            // Черновик остаётся, пользователь может исправить и попробовать снова
          }
        });
      } else if (validAttachments.length > 0 && validAttachments.every(a => a.uploadStatus === 'completed')) {
        // Все файлы уже загружены — просто публикуем черновик
        if (this.draftMessageId) {
          this.appService.editMessage$(this.draftMessageId, cleanedText, this.channelId).pipe(
            tap(() => {
              this.isSending = false;
              this.attachments.length = 0;
              this.uploadSubscriptions.forEach(sub => sub.unsubscribe());
              this.uploadSubscriptions.clear();
              this.isUploading = false;
              this.messageText = '';
              this.draftMessageId = null;
              this.uploadError = '';
              setTimeout(() => {
                this.adjustTextareaHeight();
              }, 0);
              if (this.channelService.selectedMessage) {
                this.channelService.selectedMessage.canDeselect = true;
                this.channelService.deselectMessage();
              }
              this.onNewMessageCreated.emit(cleanedText);
            }),
            untilDestroyed(this)
          ).subscribe({
            error: (err) => {
              this.isSending = false;
              this.uploadError = 'Не удалось опубликовать сообщение';
            }
          });
        }
      } else {
        // Нет файлов — создаём сообщение сразу с текстом
        this.appService.addMessage$(this.channelId, cleanedText, this.parentMessage?.id || 0, this.isGhost, [])
          .pipe(
            tap((result: any) => {
              this.isSending = false;
              this.messageText = '';
              setTimeout(() => {
                this.adjustTextareaHeight();
              }, 0);
              if (this.channelService.selectedMessage) {
                this.channelService.selectedMessage.canDeselect = true;
                this.channelService.deselectMessage();
              }
              this.onNewMessageCreated.emit(cleanedText);
            }),
            untilDestroyed(this)
          ).subscribe();
      }
    }
  }
  
  // Отмена черновика — удаляет черновик и очищает форму
  onCancelDraft(): void {
    if (this.draftMessageId) {
      this.appService.deleteMessage$(this.draftMessageId).subscribe();
      this.draftMessageId = null;
    }
    this.attachments.length = 0;
    this.uploadSubscriptions.forEach(sub => sub.unsubscribe());
    this.uploadSubscriptions.clear();
    this.uploadError = '';
    this.isUploading = false;
    this.isSending = false;
  }

  private cleanMessageText(text: string): string {
    if (!text) return '';
    return text
      .trim()
      .replace(/\n{3,}/g, '\n\n');
  }

  onAddAttachmensClick(): void {
    this.uploadService.upload().pipe(
      tap((files) => {
        if (files.length) {
          this.addAttachments(files);
        }
      }),
      untilDestroyed(this)
    ).subscribe();
  }

  onDragOver(event: any) {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: any) {
    event.preventDefault();
    this.isDragging = false;
  }

  @HostListener('dragstart')
  onDragStart() {
    this.isDragging = true;
  }

  onDragEnd(): void {
    this.isDragging = false;
  }

  onDropSuccess(event: any) {
    event.preventDefault();
    this.addAttachments(Array.from(event?.dataTransfer?.files) ?? []);
    this.isDragging = false;
  }

  onremoveClick(attachment: IUploadingAttachment): void {
    // Если это chunked upload - отменяем его
    if (attachment.isChunked && attachment.uploadId) {
      this.chunkedUploadService.abortUpload(attachment.uploadId);
      const sub = this.uploadSubscriptions.get(attachment.uploadId);
      if (sub) {
        sub.unsubscribe();
        this.uploadSubscriptions.delete(attachment.uploadId);
      }
    }
    
    this.attachments = this.attachments.filter((a) => a !== attachment);
    this.updateUploadingState();
    
    // Сбрасываем ошибку при удалении файла (возможно это был проблемный файл)
    this.uploadError = '';
  }

  onPauseClick(attachment: IUploadingAttachment): void {
    if (attachment.uploadId) {
      this.chunkedUploadService.pauseUpload(attachment.uploadId);
    }
  }

  onResumeClick(attachment: IUploadingAttachment): void {
    if (attachment.uploadId) {
      this.chunkedUploadService.resumeUpload(attachment.uploadId);
    }
  }

  private updateUploadingState(): void {
    this.isUploading = this.attachments.some(a => 
      a.isChunked && a.uploadStatus && 
      ['pending', 'uploading', 'paused', 'completing'].includes(a.uploadStatus)
    );
  }

  onUserLineClick(): void {
    // Юзер промахнулся и кликнул слева от ника. Выделим поле ввода.
    this.textarea?.nativeElement.focus();
  }

  onGhostClick(): void {
    this.isGhost = !this.isGhost;
  }

  // Автоматическое изменение высоты textarea
  onTextareaInput(event: Event): void {
    this.adjustTextareaHeight();
  }

  // Обработка вставки изображений
  onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          event.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            this.addAttachments([file]);
          }
          return;
        }
      }
    }
    // Если нет изображений, позволяем стандартную вставку текста
  }

  // Метод для изменения высоты textarea
  private adjustTextareaHeight(): void {
    if (this.textarea?.nativeElement) {
      const textarea = this.textarea.nativeElement;

      // Сбрасываем высоту для правильного расчета
      textarea.style.height = 'auto';

      // Вычисляем новую высоту
      const scrollHeight = textarea.scrollHeight;

      // Получаем значения из CSS
      const computedStyle = window.getComputedStyle(textarea);
      const minHeight = parseInt(computedStyle.minHeight) || 32; // 2rem = 32px
      const maxHeight = parseInt(computedStyle.maxHeight) || 480; // 30rem = 480px

      // Устанавливаем новую высоту с ограничениями
      const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
      textarea.style.height = newHeight + 'px';

      // Показываем скроллбар, если текст не помещается
      textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }
}
