import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewyearComponent } from './newyear.component';

describe('NewyearComponent', () => {
  let component: NewyearComponent;
  let fixture: ComponentFixture<NewyearComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ NewyearComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewyearComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
