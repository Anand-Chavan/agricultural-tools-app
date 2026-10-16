import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { InrPipe } from './shared/pipes';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app shell host', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});

describe('InrPipe', () => {
  it('formats INR currency', () => {
    const pipe = new InrPipe();
    expect(pipe.transform(1234.5)).toContain('1,234.50');
  });
});
