export const mozaicDragTreshold = 4;

export interface IMozaic {
  items: IMozaicItem[];
}

export interface IMozaicItem {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  selected?: boolean;
}
