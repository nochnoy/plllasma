export const mozaicDragTreshold = 4;

export interface IMozaic {
  items: IMozaicItem[];
}

export interface IMozaicRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IMozaicItem extends IMozaicRect {
  id: number;
  color?: string;
  selected?: boolean;
}

export interface IDrag {
  item: IMozaicItem;
  resultPixelRect: DOMRect;
  resultRect: IMozaicRect;
}
