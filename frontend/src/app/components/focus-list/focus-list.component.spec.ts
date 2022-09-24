import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FocusListComponent } from './focus-list.component';

describe('FocusListComponent', () => {
  let component: FocusListComponent;
  let fixture: ComponentFixture<FocusListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FocusListComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FocusListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
