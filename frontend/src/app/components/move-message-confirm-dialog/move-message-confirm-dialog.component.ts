import {Component, Inject} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from "@angular/material/dialog";

export interface MoveMessageConfirmDialogData {
  channelName: string;
}

@Component({
  selector: 'app-move-message-confirm-dialog',
  templateUrl: './move-message-confirm-dialog.component.html',
  styleUrls: ['./move-message-confirm-dialog.component.scss']
})
export class MoveMessageConfirmDialogComponent {

  constructor(
    public dialogRef: MatDialogRef<MoveMessageConfirmDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: MoveMessageConfirmDialogData,
  ) { }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
