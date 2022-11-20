import {Component, EventEmitter, HostListener, Input, OnInit, Output} from '@angular/core';
import {AppService} from "../../services/app.service";
import {switchMap, tap} from "rxjs/operators";
import {IChannel, IUploadingAttachment} from "../../model/app-model";
import {Utils} from "../../utils/utils";
import {Const} from "../../model/const";
import {Message} from "../../model/messages/message.model";
import {UserService} from "../../services/user.service";
@Component({
  selector: 'app-message-form',
  templateUrl: './message-form.component.html',
  styleUrls: ['./message-form.component.scss']
})
export class MessageFormComponent implements OnInit{

  constructor(
    public appService: AppService,
    public userService: UserService,
  ) { }

  @Input('channelId') channelId!: number;
  @Input('parentMessage') parentMessage?: Message;
  @Input('replyMode') replyMode: boolean = false;
  @Output('onPost') onNewMessageCreated = new EventEmitter<string>();
  messageText: string = '';
  attachments: IUploadingAttachment[] = [];
  isGhost = false;
  isDragging = false;
  isSending = false;
  userName = '';
  userIcon = '';

  ngOnInit() {
    this.userName = this.userService.user.nick ?? '';
    this.userIcon = this.userService.user.icon + '.gif';
  }

  addAttachments(files: File[]) {
    const newAttachments: IUploadingAttachment[] = files.map((file) => {
      return {
        file: file,
        isImage: file?.type?.split('/')[0] === 'image',
        isReady: false
      } as IUploadingAttachment;
    });
    const checkAttachmentsReady = () => {
      if (!newAttachments.some((attachment) => !attachment || !attachment.isReady)) {
        this.attachments = [...this.attachments, ...newAttachments];
      }
    }
    newAttachments.forEach((attachment: IUploadingAttachment) => {
      const reader = new FileReader();
      if (Utils.bytesToMegabytes(attachment.file.size) > Const.maxFileUploadSizeMb) {
        attachment.error = 'Слишком большой';
      }
      if (attachment.isImage) {
        reader.onload = (e: any) => {
          attachment.bitmap = e.target.result;
          attachment.isReady = true;
          checkAttachmentsReady();
        };
      } else {
        attachment.isReady = true;
        checkAttachmentsReady();
      }
      reader.readAsDataURL(attachment.file);
    })
  }

  onSendClick(): void {
    this.isSending = true;
    this.appService.addMessage$(this.channelId, this.messageText, this.parentMessage?.id || 0, this.attachments)
      .pipe(
        tap((result: any) => {
          this.isSending = false;
          this.attachments.length = 0;
          this.messageText = '';
          this.onNewMessageCreated.emit(this.messageText);
        }),
      ).subscribe();
  }

  onFilesSelected(event: any): void {
    this.addAttachments(Array.from(event.target?.files) ?? []);
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
    this.attachments = this.attachments.filter((a) => a !== attachment);
    if (!this.attachments.length) {
    }
  }

  onCloseClick(event: any): void {
    event?.preventDefault();
  }

}
