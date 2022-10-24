export class Utils {

  static chisl(number: number, titles: string[]) {
    let cases = [2, 0, 1, 1, 1, 2];
    return titles[ (number % 100 > 4 && number % 100 < 20) ? 2 : cases[(number % 10 < 5) ? number % 10 : 5] ];
  }

  static bytesToMegabytes(bytes: number): number {
    return bytes / (1024 * 1024);
  }

  static niceBytes(bytes: number) {
    let b = 0;
    for(; 1024 <= bytes && ++b ;) bytes /= 1024;
    return bytes.toFixed(10 > bytes && 0 < b ? 1:0)+" "+["байт ","килобайт","МБ","ГБ","ТБ","Петабайт","Эксабайт"][b];
  }

}
