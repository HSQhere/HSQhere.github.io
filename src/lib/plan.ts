/**
 * plan.ts — parses the Obsidian task syntax out of the To-Do post so the
 * /plan/ page can show the same list with progress stats instead of prose.
 */

export type TaskStatus = 'done' | 'doing' | 'todo' | 'canceled';

export type Task = {
  status: TaskStatus;
  title: string;
  created?: string;
  start?: string;
  done?: string;
  canceled?: string;
  priority: 'high' | 'medium' | 'low' | 'lowest' | null;
};

export type TaskGroup = { title: string; date: string; tasks: Task[] };

const STATUS: Record<string, TaskStatus> = { x: 'done', X: 'done', '/': 'doing', '-': 'canceled', ' ': 'todo' };

const LINE = /^\s*-\s*\[([ xX\/-])\]\s*(.*)$/;

const DATE_KIND: Record<string, 'created' | 'start' | 'done' | 'canceled'> = {
  '➕': 'created',
  '🛫': 'start',
  '✅': 'done',
  '❌': 'canceled',
};

const PRIORITY: Record<string, 'high' | 'medium' | 'low' | 'lowest'> = {
  '⏫': 'high',
  '🔼': 'medium',
  '🔽': 'low',
  '⏬': 'lowest',
};

const EMOJI = /[➕🛫✅❌⏫🔼🔽⏬]/;

function parseLine(raw: string): Task | null {
  const m = LINE.exec(raw);
  if (!m) return null;

  const status = STATUS[m[1]] ?? 'todo';
  let rest = m[2].replace(/#todo\s*/g, '').trim();

  const task: Task = { status, title: '', priority: null };

  for (const [emoji, kind] of Object.entries(DATE_KIND)) {
    const idx = rest.indexOf(emoji);
    if (idx === -1) continue;
    const after = rest.slice(idx + emoji.length).trim();
    const date = /^\d{4}-\d{2}-\d{2}/.exec(after);
    if (date) {
      task[kind] = date[0];
      rest = (rest.slice(0, idx) + after.slice(date[0].length)).trim();
    }
  }

  for (const [emoji, level] of Object.entries(PRIORITY)) {
    const idx = rest.indexOf(emoji);
    if (idx === -1) continue;
    task.priority = level;
    rest = (rest.slice(0, idx) + rest.slice(idx + emoji.length)).trim();
  }

  const cut = rest.search(EMOJI);
  task.title = (cut === -1 ? rest : rest.slice(0, cut)).trim();
  if (!task.title) return null;

  return task;
}

/** Turn the raw markdown body of the To-Do post into grouped tasks. */
export function parseTasks(body: string): TaskGroup[] {
  const groups: TaskGroup[] = [];
  let current: TaskGroup | null = null;

  // The source files are CRLF; a trailing \r defeats the $ anchor, so
  // normalise the line endings before scanning.
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(raw);
    if (heading) {
      current = { title: heading[1], date: '', tasks: [] };
      groups.push(current);
      continue;
    }

    const dateLine = /^#{3,6}\s+(\d{4}-\d{2}-\d{2})\s*$/.exec(raw);
    if (dateLine && current) {
      current.date = dateLine[1];
      continue;
    }

    if (!current) continue;

    const task = parseLine(raw);
    if (task) current.tasks.push(task);
  }

  return groups.filter((g) => g.tasks.length > 0);
}

export function taskStats(groups: TaskGroup[]) {
  const all = groups.flatMap((g) => g.tasks);
  const done = all.filter((t) => t.status === 'done').length;
  const doing = all.filter((t) => t.status === 'doing').length;
  const canceled = all.filter((t) => t.status === 'canceled').length;
  const todo = all.filter((t) => t.status === 'todo').length;
  const settled = done + canceled;
  return {
    total: all.length,
    done,
    doing,
    canceled,
    todo,
    percent: all.length ? Math.round((settled / all.length) * 100) : 0,
  };
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  done: '完成',
  doing: '进行中',
  todo: '待开始',
  canceled: '搁置',
};