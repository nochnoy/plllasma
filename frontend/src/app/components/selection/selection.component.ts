import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  OnInit,
  Output
} from '@angular/core';

@Component({
  selector: 'app-selection',
  templateUrl: './selection.component.html',
  styleUrls: ['./selection.component.scss']
})
export class SelectionComponent implements OnInit {

  constructor(
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef
  ) { }

  private rectValue?: DOMRect;
  @HostBinding('style.left')    left    = '100px';
  @HostBinding('style.top')     top     = '100px';
  @HostBinding('style.width')   width   = '100px';
  @HostBinding('style.height')  height  = '100px';

  @Input()
  set rect(value: DOMRect | undefined) {
    this.rectValue = value;
    this.updateRect();
  }

  @Output()
  rectChange = new EventEmitter<DOMRect | undefined>();

  ngOnInit(): void {
  }

  private updateRect(): void {
    if (this.rectValue) {
      this.left    = this.rectValue.x + 'px';
      this.top     = this.rectValue.y + 'px';
      this.width   = (this.rectValue.width) + 'px';
      this.height  = (this.rectValue.height) + 'px';
    }
    this.cdr.detectChanges();
  }

}
