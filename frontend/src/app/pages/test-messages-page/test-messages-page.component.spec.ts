import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestMessagesPageComponent } from './test-messages-page.component';

describe('TestMessagesPageComponent', () => {
  let component: TestMessagesPageComponent;
  let fixture: ComponentFixture<TestMessagesPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TestMessagesPageComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TestMessagesPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
