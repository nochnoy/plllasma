import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Channel2PageComponent } from './channel2-page.component';

describe('Channel2PageComponent', () => {
  let component: Channel2PageComponent;
  let fixture: ComponentFixture<Channel2PageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ Channel2PageComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Channel2PageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
