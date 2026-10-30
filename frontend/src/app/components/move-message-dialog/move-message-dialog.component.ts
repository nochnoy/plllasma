import {Component, Inject, OnInit} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from "@angular/material/dialog";
import {HttpService} from "../../services/http.service";
import {IChannelLink} from "../../model/app-model";
import {tap} from "rxjs/operators";

export interface MoveMessageDialogData {
  messageId: number;
  currentPlaceId: number;
}

export interface MoveMessageDialogResult {
  placeId: number;
  channelName: string;
}

@Component({
  selector: 'app-move-message-dialog',
  templateUrl: './move-message-dialog.component.html',
  styleUrls: ['./move-message-dialog.component.scss']
})
export class MoveMessageDialogComponent implements OnInit {

  isLoading = true;
  channels: IChannelLink[] = [];

  constructor(
    public dialogRef: MatDialogRef<MoveMessageDialogComponent, MoveMessageDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: MoveMessageDialogData,
    private httpService: HttpService,
  ) { }

  ngOnInit(): void {
    this.httpService.getChannelsList$().pipe(
      tap((result) => {
        // Текущий канал вырежем - сообщение и так уже в нём
        this.channels = (result || []).filter((channel: IChannelLink) => channel.id_place !== this.data.currentPlaceId);
        this.isLoading = false;
      })
    ).subscribe();
  }

  // Клик по каналу в списке - это и есть выбор канала: сразу закрываем диалог
  onChannelSelect(channel: IChannelLink): void {
    this.dialogRef.close({placeId: channel.id_place, channelName: channel.name});
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
