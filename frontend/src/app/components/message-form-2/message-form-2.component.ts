import {Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, ViewChild} from '@angular/core';
import {AppService} from "../../services/app.service";
import {tap} from "rxjs/operators";
import {IUploadingAttachment} from "../../model/app-model";
import {Utils} from "../../utils/utils";
import {Const} from "../../model/const";
import {Message} from "../../model/messages/message.model";
import {UserService} from "../../services/user.service";
import {UntilDestroy, untilDestroyed} from "@ngneat/until-destroy";
import {ChannelService} from "../../services/channel.service";

@UntilDestroy()
@Component({
  selector: 'app-message-form-2',
  templateUrl: './message-form-2.component.html',
  styleUrls: ['./message-form-2.component.scss']
})
export class MessageForm2Component implements OnInit{

  constructor(
    public appService: AppService,
    public userService: UserService,
    public channelService: ChannelService
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
  userName = '';
  userIcon = '';

  ngOnInit() {
    this.userName = this.userService.user.nick ?? '';
    this.userIcon = this.userService.user.icon + '.gif';
    setTimeout(() => this.textarea?.nativeElement?.focus(), 500);
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

    // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
    console.log('### onSendClick()');

    if (this.messageText.trim() || this.attachments.length) {
      this.isSending = true;

      // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
      console.log('### will send message');

      this.appService.addMessage$(this.channelId, this.messageText, this.parentMessage?.id || 0, this.isGhost, this.attachments)
        .pipe(
          tap((result: any) => {

            // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
            console.log('### tap:');
            console.log(result);

            this.isSending = false;
            this.attachments.length = 0;
            this.messageText = '';
            this.channelService.unselectMessage();
            this.onNewMessageCreated.emit(this.messageText);
          }),
          untilDestroyed(this)
        ).subscribe();
    }
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

  onUserLineClick(): void {
    // Юзер промахнулся и кликнул слева от ника. Выделим поле ввода.
    this.textarea?.nativeElement.focus();
  }

  onGhostClick(): void {
    this.isGhost = !this.isGhost;
  }

}
