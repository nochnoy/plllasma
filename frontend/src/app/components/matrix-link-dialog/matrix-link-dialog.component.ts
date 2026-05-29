import {Component, Inject} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from "@angular/material/dialog";

export interface MatrixLinkDialogData {
  url: string;
  caption: string;
}

@Component({
  selector: 'app-matrix-link-dialog',
  templateUrl: './matrix-link-dialog.component.html',
  styleUrls: ['./matrix-link-dialog.component.scss']
})
export class MatrixLinkDialogComponent {

  constructor(
    public dialogRef: MatDialogRef<MatrixLinkDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MatrixLinkDialogData,
  ) { }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    const url = this.data.url.trim();
    const caption = this.data.caption.trim();
    if (url && caption) {
      // Добавляем протокол если отсутствует
      let fixedUrl = url;
      if (!/^https?:\/\//i.test(fixedUrl)) {
        fixedUrl = 'https://' + fixedUrl;
      }
      this.dialogRef.close({ url: fixedUrl, caption });
    }
  }
}
