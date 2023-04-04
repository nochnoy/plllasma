export class Const {
  static focusIconSize = 42; // Должна быть равна переменной --focus-icon-size
  static focusIconMargin = 8; // Должна быть равна переменной --focus-icon-margin
  static focusInfoHeight = 80; // Должна быть равна переменной --focus-info-height

  static maxFileUploadSizeMb = 50;

  static remInPixels: number = parseFloat(getComputedStyle(document.documentElement).fontSize); // 1rem В пикселях
}
