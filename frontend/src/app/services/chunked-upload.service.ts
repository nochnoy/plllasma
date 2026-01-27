import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface ChunkedUploadState {
  uploadId: string;
  file: File;
  filename: string;
  totalChunks: number;
  uploadedChunks: number;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'paused' | 'completing' | 'completed' | 'error' | 'aborted';
  error?: string;
  attachment?: any;
}

// Размер чанка (5 МБ)
const CHUNK_SIZE = 5 * 1024 * 1024;

@Injectable({
  providedIn: 'root'
})
export class ChunkedUploadService {

  private uploads: Map<string, {
    state: ChunkedUploadState;
    subject: BehaviorSubject<ChunkedUploadState>;
    abortController?: AbortController;
    isPaused: boolean;
  }> = new Map();

  constructor(private http: HttpClient) { }

  /**
   * Начинает multipart upload файла
   */
  startUpload(file: File, placeId: number, messageId: number): Observable<ChunkedUploadState> {
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    
    const state: ChunkedUploadState = {
      uploadId: '',
      file,
      filename: file.name,
      totalChunks,
      uploadedChunks: 0,
      progress: 0,
      status: 'pending'
    };
    
    const subject = new BehaviorSubject<ChunkedUploadState>(state);
    
    // Инициализируем загрузку на сервере
    this.initUpload(file, placeId, messageId, totalChunks).then(uploadId => {
      state.uploadId = uploadId;
      state.status = 'uploading';
      
      this.uploads.set(uploadId, {
        state,
        subject,
        isPaused: false
      });
      
      subject.next({ ...state });
      
      // Начинаем загрузку чанков
      this.uploadChunks(uploadId);
    }).catch(error => {
      state.status = 'error';
      state.error = error.message || 'Ошибка инициализации';
      subject.next({ ...state });
      subject.complete();
    });
    
    return subject.asObservable();
  }

  /**
   * Ставит загрузку на паузу
   */
  pauseUpload(uploadId: string): void {
    const upload = this.uploads.get(uploadId);
    if (upload && upload.state.status === 'uploading') {
      upload.isPaused = true;
      upload.state.status = 'paused';
      upload.abortController?.abort();
      upload.subject.next({ ...upload.state });
    }
  }

  /**
   * Возобновляет загрузку
   */
  resumeUpload(uploadId: string): void {
    const upload = this.uploads.get(uploadId);
    if (upload && upload.state.status === 'paused') {
      upload.isPaused = false;
      upload.state.status = 'uploading';
      upload.subject.next({ ...upload.state });
      this.uploadChunks(uploadId);
    }
  }

  /**
   * Отменяет загрузку
   */
  abortUpload(uploadId: string): void {
    const upload = this.uploads.get(uploadId);
    if (upload) {
      upload.isPaused = true;
      upload.abortController?.abort();
      upload.state.status = 'aborted';
      upload.subject.next({ ...upload.state });
      upload.subject.complete();
      
      // Уведомляем сервер об отмене
      const formData = new FormData();
      formData.append('uploadId', uploadId);
      this.http.post('/api/multipart-abort.php', formData, { withCredentials: true }).subscribe();
      
      this.uploads.delete(uploadId);
    }
  }

  /**
   * Проверяет, есть ли активные загрузки
   */
  hasActiveUploads(): boolean {
    for (const upload of this.uploads.values()) {
      if (upload.state.status === 'uploading' || upload.state.status === 'paused' || upload.state.status === 'completing') {
        return true;
      }
    }
    return false;
  }

  private async initUpload(file: File, placeId: number, messageId: number, totalChunks: number): Promise<string> {
    const formData = new FormData();
    formData.append('placeId', placeId.toString());
    formData.append('messageId', messageId.toString());
    formData.append('filename', file.name);
    formData.append('filesize', file.size.toString());
    formData.append('totalChunks', totalChunks.toString());
    formData.append('mimeType', file.type || 'application/octet-stream');
    
    const response = await this.http.post<{ success: boolean; uploadId?: string; error?: string }>(
      '/api/multipart-init.php',
      formData,
      { withCredentials: true }
    ).toPromise();
    
    if (!response?.success || !response.uploadId) {
      throw new Error(response?.error || 'Ошибка инициализации');
    }
    
    return response.uploadId;
  }

  private async uploadChunks(uploadId: string): Promise<void> {
    const upload = this.uploads.get(uploadId);
    if (!upload) {
      return;
    }
    
    const { state, subject } = upload;
    const file = state.file;
    
    for (let i = state.uploadedChunks; i < state.totalChunks; i++) {
      // Проверяем, не на паузе ли мы
      if (upload.isPaused) {
        return;
      }
      
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      try {
        upload.abortController = new AbortController();
        
        await this.uploadChunk(uploadId, i, chunk, upload.abortController.signal);
        
        state.uploadedChunks = i + 1;
        state.progress = Math.round((state.uploadedChunks / state.totalChunks) * 100);
        subject.next({ ...state });
        
      } catch (error: any) {
        if (error.name === 'AbortError' || upload.isPaused) {
          // Загрузка была приостановлена
          return;
        }
        
        state.status = 'error';
        state.error = error.message || 'Ошибка загрузки чанка';
        subject.next({ ...state });
        return;
      }
    }
    
    // Все чанки загружены - завершаем
    state.status = 'completing';
    subject.next({ ...state });
    
    try {
      const attachment = await this.completeUpload(uploadId);
      state.status = 'completed';
      state.attachment = attachment;
      state.progress = 100;
      subject.next({ ...state });
      subject.complete();
      this.uploads.delete(uploadId);
    } catch (error: any) {
      state.status = 'error';
      state.error = error.message || 'Ошибка завершения загрузки';
      subject.next({ ...state });
    }
  }

  private uploadChunk(uploadId: string, chunkIndex: number, chunk: Blob, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('uploadId', uploadId);
      formData.append('chunkIndex', chunkIndex.toString());
      formData.append('chunk', chunk);
      
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/multipart-chunk.php', true);
      xhr.withCredentials = true;
      
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new DOMException('Aborted', 'AbortError'));
      });
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success) {
              resolve();
            } else {
              reject(new Error(response.error || 'Ошибка'));
            }
          } catch {
            reject(new Error('Неверный ответ сервера'));
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };
      
      xhr.onerror = () => reject(new Error('Сетевая ошибка'));
      xhr.send(formData);
    });
  }

  private async completeUpload(uploadId: string): Promise<any> {
    const formData = new FormData();
    formData.append('uploadId', uploadId);
    
    const response = await this.http.post<{ success: boolean; attachment?: any; error?: string }>(
      '/api/multipart-complete.php',
      formData,
      { withCredentials: true }
    ).toPromise();
    
    if (!response?.success) {
      throw new Error(response?.error || 'Ошибка завершения');
    }
    
    return response.attachment;
  }
}

