import {Component, EventEmitter, Input, Output} from '@angular/core';
import {AppService} from "../services/app.service";
import {switchMap, tap} from "rxjs/operators";
import {IChannel} from "../model/app-model";
@Component({
  selector: 'app-message-form',
  templateUrl: './message-form.component.html',
  styleUrls: ['./message-form.component.scss']
})
export class MessageFormComponent {

  constructor(
    public appService: AppService
  ) { }

  @Input('channel') channel?: IChannel;
  @Output('onPost') onNewMessageCreated  = new EventEmitter<string>();
  messageText: string = '';
  files: File[] = [];

  onSendClick(): void {
    if (this.channel) {
      this.appService.addMessage$(this.channel?.id_place, this.messageText, 0, this.files)
        .pipe(
          tap((result: any) => {
            this.messageText = '';
            this.onNewMessageCreated.emit(this.messageText);
          }),
        ).subscribe();
    }
  }

  onFilesSelected(event: any): void {
    const addedFiles: File[] = Array.from(event.target?.files) ?? [];
    this.files = [...this.files, ...addedFiles];
  }

}
