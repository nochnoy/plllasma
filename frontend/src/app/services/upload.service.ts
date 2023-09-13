import {ElementRef, Injectable} from '@angular/core';
import {Observable, Subject} from "rxjs";

@Injectable({
  providedIn: 'root'
})
export class UploadService {

  public uploadInput?: ElementRef;
  private nextUploadingFiles?: Subject<File[]>;

  constructor() { }

  registerUploadInput(input: ElementRef): void {
    this.uploadInput = input;
  }

  upload(): Observable<File[]> {
    this.nextUploadingFiles = new Subject<File[]>();
    this.uploadInput?.nativeElement.click();
    return this.nextUploadingFiles;
  }

  onFilesSelected(files: File[]): void {
    if (this.nextUploadingFiles) {
      this.nextUploadingFiles.next(files);
      this.nextUploadingFiles.complete();
      delete this.nextUploadingFiles;
    }
  }
}
