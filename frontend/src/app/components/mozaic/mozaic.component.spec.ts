import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MozaicComponent } from './mozaic.component';

describe('MozaicComponent', () => {
  let component: MozaicComponent;
  let fixture: ComponentFixture<MozaicComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MozaicComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MozaicComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
