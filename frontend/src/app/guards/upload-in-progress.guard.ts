import { Injectable } from '@angular/core';
import { CanDeactivate } from '@angular/router';
import { ChunkedUploadService } from '../services/chunked-upload.service';

@Injectable({
  providedIn: 'root'
})
export class UploadInProgressGuard implements CanDeactivate<any> {
  
  constructor(private chunkedUploadService: ChunkedUploadService) {}
  
  canDeactivate(): boolean {
    if (this.chunkedUploadService.hasActiveUploads()) {
      return confirm('Загрузка файлов ещё не завершена. Вы уверены, что хотите уйти?');
    }
    return true;
  }
}

