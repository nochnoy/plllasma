import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MessageFormSmallComponent } from './message-form-small.component';

describe('MessageFormComponent', () => {
  let component: MessageFormSmallComponent;
  let fixture: ComponentFixture<MessageFormSmallComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MessageFormSmallComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MessageFormSmallComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
