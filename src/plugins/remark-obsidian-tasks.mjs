import { visit } from 'unist-util-visit';

/**
 * Obsidian task syntax -> semantic list items.
 *
 *   [x] done      [/] doing      [-] canceled      [ ] todo
 *
 * GFM only understands `[ ]` / `[x]`; it reports `checked: false|true` and strips
 * the marker. `[/]` and `[-]` reach us untouched with `checked === undefined`, so
 * we detect and strip them ourselves.
 *
 * Also lifted out of the text:
 *   #todo tag                        -> dropped
 *   ➕ 🛫 ⏳ ✅ ❌ + YYYY-MM-DD      -> <span class="task-date" data-kind="...">
 *   ⏫ 🔼 🔽 ⏬                      -> data-priority
 */

const STATUS = { '/': 'doing', '-': 'canceled' };
const DATE_KIND = { '➕': 'created', '🛫': 'start', '⏳': 'scheduled', '✅': 'done', '❌': 'canceled' };
const PRIORITY = { '⏫': 'high', '🔼': 'medium', '🔽': 'low', '⏬': 'lowest' };
const MARKER_RE = /^\s*\[([ xX\/-])\]\s*/;

function makeDateNode(kind, date) {
  return {
    type: 'emphasis',
    data: {
      hName: 'span',
      hProperties: { className: ['task-date', 'task-date-' + kind], 'data-kind': kind },
    },
    children: [{ type: 'text', value: date }],
  };
}

function harvest(value) {
  const dates = [];
  let priority = null;
  let text = value;

  for (const [emoji, kind] of Object.entries(DATE_KIND)) {
    text = text.replace(new RegExp(emoji + '\\s*(\\d{4}-\\d{2}-\\d{2})', 'g'), (_m, d) => {
      dates.push({ kind, date: d });
      return ' ';
    });
    text = text.split(emoji).join(' ');
  }

  for (const [emoji, level] of Object.entries(PRIORITY)) {
    if (text.includes(emoji)) {
      priority = level;
      text = text.split(emoji).join(' ');
    }
  }

  text = text.replace(/(^|\s)#todo(?=\s|$)/g, ' ');
  text = text.replace(/[ \t]{2,}/g, ' ').replace(/\s+([，。、；：！？])/g, '$1').trim();

  return { text, dates, priority };
}

export default function remarkObsidianTasks() {
  return (tree) => {
    visit(tree, 'listItem', (node) => {
      let status;

      if (node.checked === true) status = 'done';
      else if (node.checked === false) status = 'todo';
      else {
        const first = node.children?.[0];
        if (!first || first.type !== 'paragraph') return;
        const lead = first.children?.[0];
        if (!lead || lead.type !== 'text') return;
        const m = lead.value.match(MARKER_RE);
        if (!m) return;
        const ch = m[1];
        status = ch === '/' || ch === '-' ? STATUS[ch] : ch === ' ' ? 'todo' : 'done';
        lead.value = lead.value.slice(m[0].length);
      }

      node.data = node.data || {};
      node.data.hProperties = node.data.hProperties || {};
      node.data.hProperties.className = ['task-item', 'task-' + status];
      node.data.hProperties['data-task'] = status;

      const para = node.children?.[0];
      if (!para || para.type !== 'paragraph') return;

      let priority = null;
      for (let i = 0; i < para.children.length; i++) {
        const child = para.children[i];
        if (child.type !== 'text') continue;
        const { text, dates, priority: p } = harvest(child.value);
        child.value = text;
        if (p) priority = p;
        if (dates.length) {
          para.children.splice(i + 1, 0, ...dates.map((d) => makeDateNode(d.kind, d.date)));
          i += dates.length;
        }
      }
      if (priority) node.data.hProperties['data-priority'] = priority;
    });
  };
}