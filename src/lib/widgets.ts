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
  { id: 'clock',    x: -470, y: -258, rotate: -8, size: 1.00, z: 3, label: '当前时间' },
  { id: 'tape',     x:  470, y: -330, rotate:  7, size: 0.94, z: 3, label: '音乐播放' },
  { id: 'note',     x: -468, y:  108, rotate:  6, size: 0.92, z: 2, label: '待办清单' },
  { id: 'polaroid', x:  438, y:  300, rotate: -6, size: 0.92, z: 2, label: '图库' },
  { id: 'tag',      x: -262, y:  332, rotate: -5, size: 0.80, z: 2, label: '计划只读' },
  { id: 'search',   x:   96, y:  352, rotate:  5, size: 0.84, z: 4, label: '搜索' },
];