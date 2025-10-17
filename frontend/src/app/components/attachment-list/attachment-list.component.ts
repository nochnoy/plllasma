import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { INewAttachment } from '../../model/app-model';

@Component({
  selector: 'app-attachment-list',
  templateUrl: './attachment-list.component.html',
  styleUrls: ['./attachment-list.component.scss']
})
export class AttachmentListComponent {
  @Input() attachments: INewAttachment[] = [];
}





