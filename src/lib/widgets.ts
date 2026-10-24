/**
 * widgets.ts — the desk-widget registry.
 *
 * Coordinates are pixel offsets from the centre of the hero stage. The personal
 * name sits dead centre; these six pieces ring around it at deliberately
 * uneven distances, sizes and angles (HANDOFF §4: scattered, never grid-aligned).
 * Adding a widget = one entry here plus one branch in WidgetHost.astro.
 */

export type DeskWidget = {
  id: 'clock' | 'tape' | 'note' | 'polaroid' | 'tag' | 'search';
  /** offset from the stage centre, px */
  x: number;
  y: number;
  /** degrees — never 0, the irregularity is the point */
  rotate: number;
  /** multiplier on the widget's natural size */
  size: number;
  z: number;
  label: string;
};

export const deskWidgets: DeskWidget[] = [
  { id: 'clock',    x: -498, y: -276, rotate: -9, size: 1.00, z: 3, label: '当前时间' },
  { id: 'tape',     x:  492, y: -292, rotate:  8, size: 0.88, z: 3, label: '音乐播放' },
  { id: 'note',     x: -486, y:   74, rotate:  7, size: 0.88, z: 2, label: '学习计划' },
  { id: 'polaroid', x:  470, y:  330, rotate: -7, size: 0.90, z: 2, label: '图库' },
  { id: 'tag',      x: -318, y:  322, rotate: -5, size: 0.80, z: 2, label: '计划只读' },
  { id: 'search',   x:   74, y:  296, rotate:  6, size: 0.86, z: 4, label: '搜索' },
];