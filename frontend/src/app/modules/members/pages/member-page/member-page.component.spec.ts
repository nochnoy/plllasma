import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberPageComponent } from './member-page.component';

describe('MemberPageComponent', () => {
  let component: MemberPageComponent;
  let fixture: ComponentFixture<MemberPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MemberPageComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MemberPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
