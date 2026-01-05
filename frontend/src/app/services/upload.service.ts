import {Injectable} from '@angular/core';
import {Observable, Subject} from "rxjs";

@Injectable({
  providedIn: 'root'
})
export class UploadService {

  constructor() { }

  upload(): Observable<File[]> {
    const subject = new Subject<File[]>();
    
    // Создаём input на лету
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.style.display = 'none';
    
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      subject.next(files);
      subject.complete();
      input.remove(); // Удаляем после использования
    };
    
    // Если пользователь закрыл диалог без выбора
    input.oncancel = () => {
      subject.next([]);
      subject.complete();
      input.remove();
    };
    
    document.body.appendChild(input);
    input.click();
    
    return subject;
  }
}
