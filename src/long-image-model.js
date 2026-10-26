import { migrateNote, orderedEntries, entryLabel, recordTime } from './records.js';

// Pure read models: exporting must never migrate or save the source records.
export function exportSections(notes, showTime = true) {
  return structuredClone(notes).map(source => {
    const note = migrateNote(source);
    return {
      title: note.title || ({ essay: '散文', diary: '日记', dream: '梦的记录', oc: '人物卡' }[note.kind] || (note.type === 'woven' ? '文章' : '灵感')),
      entries: orderedEntries(note).map((entry, index) => ({
        label: entryLabel(index),
        time: showTime ? recordTime(entry.createdAt) : '',
        body: entry.body || '', imageId: entry.imageId || null,
      })),
    };
  });
}

export function wrapText(text, measure, width) {
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'grapheme' }) : null;
  const rows = [];
  for (const paragraph of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    let row = '';
    const chars = segmenter ? Array.from(segmenter.segment(paragraph), item => item.segment) : Array.from(paragraph);
    for (const char of chars) {
      if (row && measure(row + char) > width) { rows.push(row); row = ''; }
      row += char;
    }
    rows.push(row);
  }
  return rows;
}

export const IMAGE_WIDTH = 900;
export const PAGE_LIMIT = 8000;
export const PAGE_PAD = 64;

// Split between complete text lines / images, never at a pixel boundary.
export function paginate(blocks, limit = PAGE_LIMIT, padding = PAGE_PAD) {
  const pages = [];
  let page = [], used = padding;
  for (const block of blocks) {
    if (!Number.isFinite(block.height) || block.height < 0 || block.height > limit - padding * 2) throw new Error('内容尺寸超出长图范围');
    if (used + block.height + padding > limit && page.length) {
      pages.push({ blocks: page, height: used + padding }); page = []; used = padding;
    }
    page.push({ ...block, y: used }); used += block.height;
  }
  if (page.length) pages.push({ blocks: page, height: used + padding });
  return pages;
}

export function moveItem(ids, from, to) {
  const next = [...ids];
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export function validateOrder(original, ordered) {
  const counts = new Map();
  for (const id of original) counts.set(id, (counts.get(id) || 0) + 1);
  if (!Array.isArray(ordered) || ordered.length !== original.length) throw new Error('脉络成员已变化，请重新打开管理脉络。');
  for (const id of ordered) {
    if (!counts.get(id)) throw new Error('脉络成员已变化，请重新打开管理脉络。');
    counts.set(id, counts.get(id) - 1);
  }
  return [...ordered];
}
