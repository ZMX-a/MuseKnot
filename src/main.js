// main.js — MuseKnot v2.7.3 (folder system + weave iteration)
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
import * as db from './db.js';
import { buildIndex, linkCount, extractLinks, extractOCs, extractTags, deriveTitle, inspirationOCs, inspirationTags } from './links.js';
import { ThreadLines, ThreadDialog } from './threads.js';
import { validateOrder } from './long-image-model.js';
import { Retreat } from './retreat.js';
import { notePreview } from './note-preview.js';
import { JournalDetail, RecordEditor } from './journal.js';
import { activeDraft } from './drafts.js';
import { registerPwa, ConnectionStatus } from './pwa.js';
import { AuthGate } from './auth.js';
import { TreeSVG, growthStage, STAGES } from './growth.js';

const html = htm.bind(React.createElement);

/* ---------- helpers (versioning + threading) ---------- */
// 老数据没 versions 字段时，把 body 当唯一的 v0
function versionsOf(insp) {
  if (!insp) return [];
  if (Array.isArray(insp.versions) && insp.versions.length) return insp.versions;
  if (insp.body) return [{ ts: insp.createdAt || insp.updatedAt || Date.now(), body: insp.body }];
  return [];
}
// 列表/搜索用的「最新版 body」（不是 versions[最新]）
function latestBody(insp) {
  if (!insp) return '';
  if (insp.body) return insp.body;
  const v = versionsOf(insp);
  return v.length ? v[v.length - 1].body : '';
}
function latestDistinctExcerpt(insp, title) {
  const entry = [...(insp?.entries || [])].sort((a, b) =>
    (a.createdAt || 0) - (b.createdAt || 0) || (a.sequence || 0) - (b.sequence || 0)
  ).at(-1);
  const body = String(entry?.body || latestBody(insp) || '').trim();
  const lines = body.split(/\n+/).map(line => line.trim()).filter(line => line && !line.startsWith('>'));
  if (!lines.length) return '';
  const label = String(title || '').trim();
  if (lines[0] === label) lines.shift();
  else if (label && lines[0].startsWith(label)) lines[0] = lines[0].slice(label.length).trim();
  return lines.filter(Boolean).join(' ').slice(0, 160);
}
// 同名 title 聚合（线程）
function buildViewItems(inspirations) {
  return inspirations.map(insp => ({ kind: 'insp', insp }));
}

/* ---------- Kinds (folders) ---------- */
const KINDS = [
  { id: 'inspiration', label: '灵感', rune: '·' },
  { id: 'image',       label: '图片', rune: '◐' },
  { id: 'essay',       label: '散文', rune: '¶' },
  { id: 'diary',       label: '日记', rune: '✎' },
  { id: 'oc',          label: 'OC',  rune: '◇' },
  { id: 'dream',       label: '梦的记录', rune: '☾' },
];
const KIND_BY_ID = Object.fromEntries(KINDS.map(k => [k.id, k]));
// 老数据兼容：没有 kind 字段视为 inspiration
const kindOf = (insp) => (insp && insp.kind) || 'inspiration';

/* ---------- SproutSVG (主界面 6 种芽形) ---------- */
// viewBox 24x24，颜色一律走 currentColor。阶段用 stage 影响副叶/纹理数量。
function SproutSVG({ kind, stage = 0 }) {
  // 编织稿：两股绳交错
  if (kind === 'weave') {
    return html`<svg viewBox="0 0 24 24" className="sprout-svg sprout-weave" aria-hidden="true">
      <path d="M6 22 C 6 14, 12 14, 12 8 C 12 14, 18 14, 18 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M18 22 C 18 14, 12 14, 12 8 C 12 14, 6 14, 6 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;
  }
  return html`<svg viewBox="0 0 24 24" className=${'sprout-svg sprout-' + kind + ' stage-' + stage} aria-hidden="true">${(() => {
    if (kind === 'inspiration') {
      // 嫩芽：细茎 + 两片小叶
      return html`<g>
        <path d="M12 22 L12 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>
        <path d="M12 11 Q8 9 7 4 Q11 6 12 11 Z" fill="currentColor" opacity="0.92"/>
        <path d="M12 11 Q16 9 17 5 Q13 7 12 11 Z" fill="currentColor" opacity="0.78"/>
      </g>`;
    }
    if (kind === 'image') {
      // 花苞：闭合水滴
      return html`<g>
        <path d="M12 22 L12 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>
        <path d="M12 4 C 7 6, 6 12, 12 14 C 18 12, 17 6, 12 4 Z" fill="currentColor" opacity="0.9"/>
        <path d="M12 4 L12 14" stroke="currentColor" stroke-width="0.6" opacity="0.4" fill="none"/>
      </g>`;
    }
    if (kind === 'essay') {
      // 散文：开放的花，多瓣
      return html`<g>
        <path d="M12 22 L12 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>
        <ellipse cx="12" cy="6" rx="2.2" ry="3.2" fill="currentColor" opacity="0.9"/>
        <ellipse cx="7" cy="9" rx="2.2" ry="3" transform="rotate(-30 7 9)" fill="currentColor" opacity="0.75"/>
        <ellipse cx="17" cy="9" rx="2.2" ry="3" transform="rotate(30 17 9)" fill="currentColor" opacity="0.75"/>
        <ellipse cx="9" cy="13" rx="1.8" ry="2.4" transform="rotate(-55 9 13)" fill="currentColor" opacity="0.6"/>
        <ellipse cx="15" cy="13" rx="1.8" ry="2.4" transform="rotate(55 15 13)" fill="currentColor" opacity="0.6"/>
      </g>`;
    }
    if (kind === 'diary') {
      // 日记：紧闭的小芽
      return html`<g>
        <path d="M12 22 L12 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>
        <ellipse cx="12" cy="9" rx="3.2" ry="4.5" fill="currentColor" opacity="0.92"/>
        <path d="M12 5 L12 13" stroke="currentColor" stroke-width="0.5" opacity="0.35" fill="none"/>
        ${stage >= 2 ? html`<path d="M9 8 Q12 10 15 8" stroke="currentColor" stroke-width="0.4" fill="none" opacity="0.4"/>` : null}
      </g>`;
    }
    if (kind === 'oc') {
      // OC：螺旋卷曲
      return html`<g>
        <path d="M12 22 L12 16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>
        <path d="M12 16 C 12 12, 17 12, 17 8 C 17 4, 11 4, 11 8 C 11 11, 14 11, 14 9 C 14 7, 12 7, 12 9"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
      </g>`;
    }
    if (kind === 'dream') {
      // 梦的记录：云朵形
      return html`<g>
        <path d="M12 22 L12 16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>
        <path d="M5 14 Q 5 9 9 10 Q 11 6 14 8 Q 17 6 18 10 Q 22 10 21 14 Q 21 17 17 16 L 8 16 Q 5 17 5 14 Z"
          fill="currentColor" opacity="0.85"/>
        <circle cx="9" cy="12" r="0.6" fill="white" opacity="0.5"/>
        <circle cx="14" cy="11" r="0.7" fill="white" opacity="0.6"/>
      </g>`;
    }
    return null;
  })()}</svg>`;
}

/* ---------- helpers ---------- */
const imageCache = new Map();
function useImage(imageId) {
  const [url, setUrl] = useState(() => (imageId ? imageCache.get(imageId) || null : null));
  useEffect(() => {
    let active = true;
    if (!imageId) { setUrl(null); return; }
    if (imageCache.has(imageId)) { setUrl(imageCache.get(imageId)); return; }
    db.getImage(imageId).then(blob => {
      if (!active || !blob) return;
      const u = URL.createObjectURL(blob);
      imageCache.set(imageId, u);
      setUrl(u);
    }).catch(() => {});
    return () => { active = false; };
  }, [imageId]);
  return url;
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 时间氛围 — 给时间戳一点人的温度
function timeMood(ts) {
  const h = new Date(ts).getHours();
  if (h < 5) return '深夜';
  if (h < 8) return '黎明';
  if (h < 12) return '上午';
  if (h < 14) return '正午';
  if (h < 18) return '午后';
  if (h < 21) return '黄昏';
  return '夜晚';
}

// Render body text with [[link]] @oc #tag highlighting + blockquote (> ) support
// 编织稿里插入的引用块是连续的 > 开头行，渲染成 <blockquote>
const TOKEN_RE = /\[\[([^\]]+?)\]\]|@([^\s@#,\[\]，。、；：！？\n]+)|#([^\s@#,\[\]，。、；：！？\n]+)/g;
function tokenizeSegment(text, resolve, onOpen, onOc, onTag, kp) {
  const nodes = [];
  let last = 0, m, key = 0;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const title = m[1].trim();
      const id = resolve(title);
      nodes.push(html`<span key=${kp + '-k' + (key++)} className=${'rich-link' + (id ? '' : ' broken')} onClick=${id ? () => onOpen(id) : null}>${title}</span>`);
    } else if (m[2] !== undefined) {
      const name = m[2].trim();
      nodes.push(html`<span key=${kp + '-k' + (key++)} className="rich-oc" onClick=${() => onOc && onOc(name)}>${'@' + name}</span>`);
    } else if (m[3] !== undefined) {
      const name = m[3].trim();
      nodes.push(html`<span key=${kp + '-k' + (key++)} className="rich-tag" onClick=${() => onTag && onTag(name)}>${'#' + name}</span>`);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
function renderBody(text, resolve, onOpen, onOc, onTag) {
  if (!text) return null;
  const lines = text.split('\n');
  const blocks = [];
  let textBuf = [], quoteBuf = [], bi = 0;
  const flushText = () => {
    if (!textBuf.length) return;
    const c = textBuf.join('\n');
    blocks.push(html`<div key=${'tb' + (bi++)} className="text-block">${tokenizeSegment(c, resolve, onOpen, onOc, onTag, 'tb' + bi)}</div>`);
    textBuf = [];
  };
  const flushQuote = () => {
    if (!quoteBuf.length) return;
    const c = quoteBuf.join('\n');
    blocks.push(html`<blockquote key=${'qb' + (bi++)} className="quote-block">${tokenizeSegment(c, resolve, onOpen, onOc, onTag, 'qb' + bi)}</blockquote>`);
    quoteBuf = [];
  };
  for (const line of lines) {
    if (line === '>') { flushText(); quoteBuf.push(''); }
    else if (line.startsWith('> ')) { flushText(); quoteBuf.push(line.slice(2)); }
    else { flushQuote(); textBuf.push(line); }
  }
  flushText();
  flushQuote();
  return html`<div className="rich-body">${blocks}</div>`;
}

function countBy(arr) {
  const m = new Map();
  for (const x of arr) if (x) m.set(x, (m.get(x) || 0) + 1);
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
}

/* ---------- moods (情绪标记) ---------- */
const MOODS = [
  { id: 'dark',  label: '晦暗', color: '#5b6473' },
  { id: 'warm',  label: '温热', color: '#c97a4a' },
  { id: 'sharp', label: '锐利', color: '#a8b8c2' },
  { id: 'drift', label: '飘忽', color: '#a892c4' },
  { id: 'still', label: '沉静', color: '#6f8c5c' },
];
const MOOD_BY_ID = Object.fromEntries(MOODS.map(m => [m.id, m]));

/* ---------- echoes (回响 · 纪念日匹配) ---------- */
const ECHO_MILESTONES = [7, 30, 90, 180, 365];
function anniversaryMatches(inspirations) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const matches = [];
  for (const i of inspirations) {
    if (!i.createdAt) continue;
    const c = new Date(i.createdAt);
    const ageDays = Math.round((today - new Date(c.getFullYear(), c.getMonth(), c.getDate()).getTime()) / 86400000);
    if (ageDays < 1) continue;
    if (ECHO_MILESTONES.includes(ageDays)) {
      matches.push({ insp: i, kind: 'anniversary', ageDays });
    } else if (c.getMonth() === now.getMonth() && c.getDate() === now.getDate()) {
      const years = now.getFullYear() - c.getFullYear();
      if (years >= 1 && !matches.find(m => m.insp.id === i.id)) {
        matches.push({ insp: i, kind: 'yearly', years });
      }
    }
  }
  return matches.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'yearly' ? -1 : 1;
    return b.insp.createdAt - a.insp.createdAt;
  });
}

/* ---------- knot mark (logo) ---------- */
const KnotMark = ({ size = 22, className = '' }) => html`<svg className=${className} width=${size} height=${size} viewBox="0 0 32 32" aria-hidden="true">
  <path d="M5 24 C5 15 13 13 16 17 C19 21 27 19 27 11" stroke="#4f7038" strokeWidth="2.6" fill="none" strokeLinecap="round" />
  <path d="M5 10 C5 19 13 21 16 17 C19 13 27 15 27 23" stroke="#7ea65c" strokeWidth="2.6" fill="none" strokeLinecap="round" />
  <circle cx="16" cy="17" r="2" fill="#c9a052" />
</svg>`;

/* ---------- braid mark (编织结 logo · 两股绳交错成辫) ---------- */
const BraidMark = ({ size = 32, className = '' }) => html`<svg className=${'braid-mark ' + className} width=${size} height=${size} viewBox="0 0 32 32" aria-hidden="true">
  <path d="M8 5 C8 13 24 13 24 21 C24 27 8 27 8 21" stroke="#7ea65c" strokeWidth="2.4" fill="none" strokeLinecap="round" />
  <path d="M24 5 C24 13 8 13 8 21 C8 27 24 27 24 21" stroke="#4f7038" strokeWidth="2.4" fill="none" strokeLinecap="round" />
  <circle cx="16" cy="16" r="2.2" fill="#c9a052" />
</svg>`;

/* ---------- MoodPicker (共享) ---------- */
function MoodPicker({ value, onChange, compact }) {
  return html`<div className=${'mood-picker' + (compact ? ' compact' : '')}>
    <span className="mood-label">此刻的感觉</span>
    ${MOODS.map(m => html`<button key=${m.id}
      type="button"
      title=${m.label}
      className=${'mood-dot' + (value === m.id ? ' on' : '')}
      style=${{ '--mood-color': m.color }}
      onClick=${() => onChange(value === m.id ? null : m.id)}>
      <span className="ring"></span>
    </button>`)}
    ${value ? html`<span className="mood-name">${MOOD_BY_ID[value].label}</span>` : null}
  </div>`;
}

/* ---------- theme (夜间林间) ---------- */
const THEME_ICONS = {
  auto: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" /></svg>`,
  light: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="4.22" y1="4.22" x2="6.34" y2="6.34" /><line x1="17.66" y1="17.66" x2="19.78" y2="19.78" /><line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" /><line x1="4.22" y1="19.78" x2="6.34" y2="17.66" /><line x1="17.66" y1="6.34" x2="19.78" y2="4.22" /></svg>`,
  dark: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>`,
};
const THEME_LABELS = { auto: '跟随系统', light: '日间', dark: '夜间' };

/* ---------- Sidebar ---------- */
function Sidebar({ tags, ocs, filter, onFilter, onClearFilter, search, onSearch, onNew, onClearAll, total, themePref, onCycleTheme, onOpenStyle }) {
  const [armClear, setArmClear] = useState(false);
  useEffect(() => {
    if (!armClear) return;
    const t = setTimeout(() => setArmClear(false), 3500);
    return () => clearTimeout(t);
  }, [armClear]);
  const clearClick = () => {
    if (armClear) { setArmClear(false); onClearAll(); }
    else setArmClear(true);
  };
  return html`<aside className="sidebar">
    <div className="brand">
      <div className="brand-row">
        <h1>
          <${KnotMark} size=${24} className="mk-mark" />
          MuseKnot
        </h1>
        <button className="theme-toggle" title=${'主题：' + THEME_LABELS[themePref] + '（点击切换）'} aria-label="切换日间夜间" onClick=${onCycleTheme}>${THEME_ICONS[themePref]}</button>
        <button className="theme-toggle style-toggle" title="自定义样式" aria-label="自定义样式" onClick=${onOpenStyle}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9"/></svg>
        </button>
      </div>
      <p className="tagline">灵感成结，故事生根</p>
      <p className="tagline-en">Tie your scattered muses into a story.</p>
    </div>
    <div className="search-wrap">
      <input className="search" placeholder="寻迹 — 搜记录、想法、意象…" value=${search} onChange=${e => onSearch(e.target.value)} />
    </div>
    <button className="btn primary new-btn" onClick=${onNew}>
      <svg className="knot-ic" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M5 24 C5 15 13 13 16 17 C19 21 27 19 27 11" stroke-width="3.4" fill="none" stroke="currentColor" strokeLinecap="round" />
        <path d="M5 10 C5 19 13 21 16 17 C19 13 27 15 27 23" stroke-width="3.4" fill="none" stroke="currentColor" strokeLinecap="round" />
      </svg>
      新建笔记
    </button>
    <div className="side-scroll">
      ${ocs.length ? html`<div className="side-section">
        <h3>OC</h3>
        <ul className="side-list">
          ${ocs.map(o => html`<li key=${o.name}><button className=${'side-item' + (filter && filter.type === 'oc' && filter.value === o.name ? ' active' : '')} onClick=${() => onFilter({ type: 'oc', value: o.name })}><span className="dot" style=${{ background: '#b97c4e' }}></span>${o.name}<span className="count">${o.count}</span></button></li>`)}
        </ul>
      </div>` : null}
      ${tags.length ? html`<div className="side-section">
        <h3>线团 · 标签</h3>
        <ul className="side-list">
          ${tags.map(t => html`<li key=${t.name}><button className=${'side-item' + (filter && filter.type === 'tag' && filter.value === t.name ? ' active' : '')} onClick=${() => onFilter({ type: 'tag', value: t.name })}><span className="dot" style=${{ background: '#a4c07e' }}></span>${t.name}<span className="count">${t.count}</span></button></li>`)}
        </ul>
      </div>` : null}
    </div>
    <div className="side-section side-foot">
      <span>共 ${total} 条记录</span>
      ${total ? html`<button className=${'link-btn' + (armClear ? ' armed' : '')} title=${armClear ? '再点一次确认清空' : ''} onClick=${clearClick}>${armClear ? '确定？再点一次' : '清空全部'}</button>` : null}
    </div>
  </aside>`;
}

/* ---------- Topbar ---------- */
function Topbar({ view, onView, filter, search, kindFilter, onBack, hasSel, onNew, count }) {
  const kindLabel = kindFilter ? KIND_BY_ID[kindFilter].label : null;
  const crumb = filter
    ? `${filter.type === 'oc' ? 'OC' : '脉络标签'}：${filter.value}`
    : (search ? `寻迹"${search}"` : (kindLabel ? `${kindLabel} 文件夹` : '全部记录'));
  return html`<div className="topbar">
    ${hasSel ? html`<button className="btn ghost sm" onClick=${onBack}>← 返回</button>` : null}
    <div>
      <h2>${hasSel ? '记录详情' : (view === 'connections' ? '记录脉络' : '记录库')}</h2>
      <div className="crumbs">${view === 'connections' && !hasSel ? count + ' 条脉络' : crumb + ' · ' + count + ' 条'}</div>
    </div>
    <div className="spacer"></div>
    <button className="record-link" onClick=${() => { onBack(); onView('graph'); }}>返回首页</button>
    ${!hasSel ? html`<div className="view-toggle">
      <button className=${view === 'list' ? 'active' : ''} onClick=${() => onView('list')}>记录库</button>

      <button className=${view === 'connections' ? 'active' : ''} onClick=${() => onView('connections')}>记录脉络</button>
    </div>` : null}
    <button className="btn primary sm" onClick=${() => onNew()}>＋ 新建记录</button>
  </div>`;
}

/* ---------- FolderRow (kind 切换) ---------- */
function FolderRow({ kindFilter, onChange, counts }) {
  return html`<div className="folder-row" role="tablist" aria-label="文件夹">
    <button key="all" role="tab" className=${'folder-chip' + (kindFilter == null ? ' on' : '')}
      onClick=${() => onChange(null)}>
      <span className="folder-rune">✦</span>全部
      <span className="folder-count">${counts._all || 0}</span>
    </button>
    ${KINDS.map(k => html`<button key=${k.id} role="tab"
      className=${'folder-chip' + (kindFilter === k.id ? ' on' : '') + ' kind-' + k.id}
      onClick=${() => onChange(kindFilter === k.id ? null : k.id)}>
      <span className="folder-rune">${k.rune}</span>${k.label}
      <span className="folder-count">${counts[k.id] || 0}</span>
    </button>`)}
  </div>`;
}

/* ---------- InspCard / ThreadCard (列表视图) ---------- */
function InspCard({ insp, index, onOpen, selectMode, selected, onToggleSelect }) {
  const url = useImage(insp.imageId);
  const preview = notePreview(insp);
  const excerpt = latestDistinctExcerpt(insp, preview.title);
  const open = selectMode ? () => onToggleSelect(insp.id) : () => onOpen(insp.id);
  const kind = KIND_BY_ID[kindOf(insp)] || KIND_BY_ID.inspiration;
  return html`<article className=${'note-entry' + (excerpt ? ' has-excerpt' : '') + (selected ? ' selected' : '') + (url ? ' with-image' : '')} role="button" tabIndex="0" aria-label=${preview.title || '图片笔记'} onClick=${open} onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}>
    ${selectMode ? html`<span className="note-check" aria-hidden="true">${selected ? '✓' : '○'}</span>` : null}
    <div className="note-entry-text">${preview.title ? html`<h3>${preview.title}</h3>` : null}</div>
    ${excerpt ? html`<p className="note-entry-excerpt">${excerpt}</p>` : null}
    <div className="note-entry-meta"><span className="note-entry-kind">${kind.label}</span><time>续写 ${Math.max(0, (insp.entries?.length || 1) - 1)} 次 · ${fmtDate(insp.updatedAt)} 更新${insp.type === 'weave' ? ' · 编织稿' : ''}</time></div>
    ${url ? html`<img className="note-entry-image" src=${url} alt="笔记配图" />` : null}
  </article>`;
}
function ThreadCard({ thread, onOpenThread }) {
  const entryCount = thread.entries.length;
  const last = thread.entries[entryCount - 1];
  const first = thread.entries[0];
  const spanDays = Math.max(1, Math.round((last.updatedAt - first.createdAt) / 86400000));
  const spanLabel = spanDays <= 1 ? '同一天' : (spanDays < 30 ? '跨 ' + spanDays + ' 天' : '跨 ' + Math.round(spanDays / 30) + ' 月');
  const lastText = latestBody(last);
  const bodyPreview = lastText.split('\n').filter(l => l.trim() && !l.startsWith('>')).slice(0, 1).join(' ');
  return html`<div className="card card-row thread-card" onClick=${() => onOpenThread(thread.title)}>
    <div className="card-body">
      <div className="card-line card-preview-line is-primary">${thread.title}</div>
      <div className="card-meta-line">
        <span className="kind-tag kind-thread"><${BraidMark} size=${9} /> 线团 ${entryCount}</span>
        <span className="meta-dot">·</span>
        <span className="meta-time">${spanLabel} · ${fmtDate(last.updatedAt)}</span>
      </div>
    </div>
    <div className="card-sprout card-sprout-thread" aria-hidden="true">
      <span className="thread-stack-dot"></span>
      <span className="thread-stack-dot"></span>
      <span className="thread-stack-dot"></span>
      ${entryCount >= 4 ? html`<span className="thread-stack-more">+${entryCount - 3}</span>` : null}
    </div>
  </div>`;
}

function ListView({ viewItems, index, onOpenInsp, onOpenThread, onNew, selectMode, selectedIds, onToggleSelect }) {
  if (!viewItems.length) {
    return html`<div className="empty-state quiet-empty"><p>这里会留下你的片段。</p></div>`;
  }
  return html`<div className="grid">
    ${viewItems.map(vi => vi.kind === 'thread'
      ? html`<${ThreadCard} key=${'t::' + vi.title} thread=${vi} onOpenThread=${onOpenThread} />`
      : html`<${InspCard} key=${vi.insp.id} insp=${vi.insp} index=${index} onOpen=${onOpenInsp} selectMode=${selectMode} selected=${selectedIds && selectedIds.has(vi.insp.id)} onToggleSelect=${onToggleSelect} />`
    )}

  </div>`;
}

/* ---------- QuickInput (首页常驻输入) ---------- */
function QuickInput({ onQuickSave, onOpenFull, defaultKind = 'inspiration' }) {
  const [body, setBody] = useState('');
  const [ripple, setRipple] = useState(false);
  const [kind, setKind] = useState(defaultKind);
  // 跟着当前文件夹走
  useEffect(() => { setKind(defaultKind); }, [defaultKind]);
  const taRef = useRef(null);
  const hasText = body.trim().length > 0;

  const submit = async () => {
    if (!hasText) return;
    const now = Date.now();
    const title = deriveTitle(body) || `无题 · ${fmtTime(now)}`;
    await onQuickSave({
      id: db.uuid(),
      title,
      body: body.trim(),
      imageId: undefined,
      createdAt: now,
      updatedAt: now,
      mood: null,
      type: 'knot',
      kind: kind || 'inspiration',
    });
    setBody('');
    setRipple(true);
    setTimeout(() => setRipple(false), 700);
    if (taRef.current) taRef.current.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !e.altKey) {
      e.preventDefault();
      submit();
    }
  };

  return html`<div className=${'quick-input' + (ripple ? ' ripple' : '')}>
    <textarea
      ref=${taRef}
      className="quick-textarea"
      placeholder=${'刚才想到什么…'}
      value=${body}
      onChange=${e => setBody(e.target.value)}
      onKeyDown=${onKeyDown}
      rows=${2}
    />
    <div className="quick-foot">
      <div className="quick-actions quick-actions-right">
        <button className="link-btn" title="打开完整编辑器（可加图）" onClick=${onOpenFull}>用完整编辑器</button>
        <button className="btn primary sm" disabled=${!hasText} onClick=${submit}>系上</button>
      </div>
    </div>
  </div>`;
}

/* ---------- EchoCard (回响) ---------- */
function EchoCard({ echo, onOpen, onDismiss }) {
  const { insp, kind, ageDays, years } = echo;
  const head = kind === 'yearly'
    ? `又是一年的这一天`
    : `${ageDays} 天前，你系下了这个结`;
  const url = useImage(insp.imageId);
  return html`<div className="echo-card">
    <div className="echo-glow"></div>
    <div className="echo-inner">
      <div className="echo-head">
        <span className="echo-rune">↻</span>
        <span className="echo-head-text">${head}</span>
        <button className="echo-close" title="知道了" onClick=${onDismiss}>×</button>
      </div>
      <div className="echo-body" onClick=${() => onOpen(insp.id)}>
        ${url ? html`<img className="echo-img" src=${url} alt="" />` : null}
        <div className="echo-meta">
          ${(insp.type === 'weave' || !(insp.body || '').trim()) ? html`<div className="echo-title">${insp.title || '未命名'}</div>` : null}
          ${insp.body ? html`<div className="echo-preview">${insp.body.split('\n').filter(l => l.trim()).slice(0, 2).join(' ').slice(0, 90)}</div>` : null}
          ${years ? html`<div className="echo-years">已经第 ${years} 年</div>` : null}
        </div>
      </div>
    </div>
  </div>`;
}

/* ---------- SelectBar (编织选择模式入口 + 浮动操作条) ---------- */
function SelectBar({ count, selectMode, selectedCount, onEnter, onWeave, onConnect, onCancel }) {
  if (selectMode) {
    return html`<div className="select-bar">
      <span className="select-bar-count">已选 ${selectedCount} 条记录</span>
      <div className="spacer"></div>
      <button className="btn ghost sm" onClick=${onCancel}>取消</button>
      <button className="btn ghost sm" disabled=${selectedCount < 2} onClick=${onWeave}>编成一篇</button>
      <button className="btn primary sm" disabled=${selectedCount < 1} onClick=${onConnect}>连成脉络</button>
    </div>`;
  }
  if (count < 1) return null;
  return html`<div className="select-bar enter compact">
    <span className="select-bar-hint">${count} 条记录</span>
    <button className="link-btn" onClick=${onEnter}>选择记录并连接 →</button>
  </div>`;
}

/* ---------- Independent records and recoverable history ---------- */
function DetailView({ insp, index, inspirations, onOpen, onDelete, onOc, onTag, onUpdate, onOpenThreads }) {
  const back = (index.backlinks.get(insp.id) || []).map(id => inspirations.find(n => n.id === id)).filter(Boolean);
  return html`<div className="detail">
    <div className="detail-thread-action"><button className="btn ghost sm" onClick=${() => onOpenThreads(insp.id)}>＋ 加入脉络</button></div>
    <${JournalDetail} key=${insp.id} insp=${insp} onUpdate=${onUpdate} onDelete=${onDelete}
      kinds=${KINDS} renderContent=${body => renderBody(body, index.resolve, onOpen, onOc, onTag)} />
    ${back.length ? html`<section className="field"><h3>关联到这里的记录</h3>
      ${back.map(n => html`<button className="record-link" key=${n.id} onClick=${() => onOpen(n.id)}>${n.title}</button>`)}
    </section>` : null}
    ${insp.sourceIds?.length ? html`<section className="field"><h3>整理自</h3>
      ${insp.sourceIds.map(id => inspirations.find(n => n.id === id)).filter(Boolean).map(n => html`<button className="record-link" key=${n.id} onClick=${() => onOpen(n.id)}>${n.title}</button>`)}
    </section>` : null}
  </div>`;
}
const Editor = RecordEditor;

/* ---------- WeaveSourceItem (编织源结卡片 · 独立组件以调用 useImage) ---------- */
function WeaveSourceItem({ insp, onInsert, onMoveUp, onMoveDown, onRemove, canUp, canDown }) {
  const url = useImage(insp.imageId);
  const prev = (insp.body || '').split('\n').filter(l => l.trim() && !l.startsWith('>')).slice(0, 1).join(' ').slice(0, 48);
  return html`<div className="weave-src">
    ${url ? html`<img className="weave-src-img" src=${url} alt="" />` : html`<span className="weave-src-ph"><${KnotMark} size=${20} /></span>`}
    <div className="weave-src-body">
      <div className="weave-src-title">${insp.title || '未命名'}</div>
      ${prev ? html`<div className="weave-src-prev">${prev}</div>` : null}
    </div>
    <div className="weave-src-actions">
      <button className="btn sm primary" title="把这条作为引用块嵌入正文" onClick=${() => onInsert(insp)}>插入</button>
      <div className="weave-src-reorder">
        <button className="icon-btn" title="上移" disabled=${!canUp} onClick=${onMoveUp}>↑</button>
        <button className="icon-btn" title="下移" disabled=${!canDown} onClick=${onMoveDown}>↓</button>
      </div>
      <button className="icon-btn danger" title="从这篇移除" onClick=${onRemove}>×</button>
    </div>
  </div>`;
}

/* ---------- WeaveEditor (编织一篇 · 成型) ---------- */
function WeaveEditor({ sources, onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [srcs, setSrcs] = useState(() => sources.slice());
  const [tying, setTying] = useState(false);
  const [emptyHint, setEmptyHint] = useState(false);
  const taRef = useRef(null);

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= srcs.length) return;
    const next = srcs.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setSrcs(next);
  };
  const remove = (i) => setSrcs(prev => prev.filter((_, k) => k !== i));

  const insertQuote = (insp) => {
    const ref = taRef.current;
    const val = body || '';
    const start = ref ? (ref.selectionStart ?? val.length) : val.length;
    const end = ref ? (ref.selectionEnd ?? start) : start;
    // 源正文取前 6 行非引用块，作为引用块嵌入
    const srcLines = (insp.body || '').split('\n').filter(l => l.trim() && !l.startsWith('>')).slice(0, 6);
    const quoted = srcLines.length ? srcLines.join('\n> ') : '（这条结没有正文，只有图或念头）';
    const block = `\n\n[[${insp.title || '未命名'}]]\n> ${quoted}\n\n`;
    const newVal = val.slice(0, start) + block + val.slice(end);
    setBody(newVal);
    requestAnimationFrame(() => { if (ref) { ref.focus(); const p = start + block.length; ref.selectionStart = ref.selectionEnd = p; } });
  };

  const submit = () => {
    if (tying) return;
    const trimmed = body.trim();
    if (!trimmed) {
      setEmptyHint(true);
      if (taRef.current) taRef.current.focus();
      clearTimeout(submit._h);
      submit._h = setTimeout(() => setEmptyHint(false), 2600);
      return;
    }
    const now = Date.now();
    const finalTitle = title.trim() || deriveTitle(body) || `编织 · ${fmtTime(now)}`;
    const payload = {
      id: db.uuid(),
      type: 'weave',
      title: finalTitle,
      body: body,
      imageId: undefined,
      sourceIds: srcs.map(s => s.id),
      createdAt: now,
      updatedAt: now,
      mood: null,
    };
    setTying(true);
    setTimeout(() => onSave(payload), 980);
  };

  return html`<div className="editor-overlay" onClick=${e => { if (e.target === e.currentTarget) onCancel(); }}>
    <div className="editor weave-editor">
      <div className="editor-head">
        <h2>编织一篇</h2>
        <p className="editor-sub">把左边的源结排好序，写连接它们的文字；需要引用时点「插入」，它的正文会作为引用块嵌进来。</p>
      </div>
      <div className="weave-layout">
        <div className="weave-sources">
          <div className="weave-sources-head">源结 · ${srcs.length}</div>
          ${srcs.length === 0 ? html`<div className="weave-src-empty">没有源结了——取消重来，或直接写一篇独立的作品。</div>` : null}
          ${srcs.map((s, i) => html`<${WeaveSourceItem} key=${s.id} insp=${s} canUp=${i > 0} canDown=${i < srcs.length - 1}
            onInsert=${() => insertQuote(s)} onMoveUp=${() => move(i, -1)} onMoveDown=${() => move(i, 1)} onRemove=${() => remove(i)} />`)}
        </div>
        <div className="weave-main">
          <input className="weave-title-input" placeholder="给这篇成品起个名……" value=${title} onChange=${e => setTitle(e.target.value)} />
          <textarea className=${'textarea weave-textarea' + (emptyHint ? ' nudge' : '')} ref=${taRef} value=${body}
            placeholder=${'写连接这些记录的文字……\n点左边「插入」，源结的正文会作为引用块嵌到这里，标题自动接上 [[双向链接]]。'}
            onChange=${e => setBody(e.target.value)}
            style=${{ minHeight: '320px', flex: '1' }} />
          ${emptyHint ? html`<div className="empty-hint">还空着——至少写一句连接的话，哪怕只是把它们摆在一起的理由。</div>` : null}
        </div>
      </div>
      <div className="editor-foot">
        <button className="btn ghost" onClick=${onCancel} disabled=${tying}>取消</button>
        <button className="btn primary" onClick=${submit} disabled=${tying}>${tying ? '正在编紧…' : '编成这一篇'}</button>
      </div>
      ${tying ? html`<div className="tie-overlay">
        <svg className="tie-braid" viewBox="0 0 32 32" width="56" height="56" aria-hidden="true">
          <path d="M8 5 C8 13 24 13 24 21 C24 27 8 27 8 21" stroke="var(--leaf)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M24 5 C24 13 8 13 8 21 C8 27 24 27 24 21" stroke="var(--moss)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <circle cx="16" cy="16" r="2.4" fill="var(--gold)" className="tie-dot" />
        </svg>
        <div className="tie-text">已编好</div>
      </div>` : null}
    </div>
  </div>`;
}

/* ---------- 自定义样式面板 (用户自调外观，持久化 localStorage) ---------- */
function StylePanel({ initial, onChange, onSave, onReset, onClose }) {
  const taRef = useRef(null);
  const handleInput = () => { if (taRef.current) onChange(taRef.current.value); };
  const handleReset = () => {
    if (taRef.current) taRef.current.value = '';
    onChange('');
    onReset();
  };
  const handleSave = () => { if (taRef.current) onChange(taRef.current.value); onSave(); onClose(); };
  return html`<div className="editor-overlay style-overlay" onClick=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="style-panel" role="dialog" aria-label="自定义样式">
      <div className="style-head">
        <h3>自定义样式</h3>
        <button className="icon-btn" title="关闭" aria-label="关闭" onClick=${onClose}>✕</button>
      </div>
      <p className="style-hint">在这里写 CSS，<b>实时预览</b>；点「保存」会记在浏览器里，下次打开还在。写错不影响其它功能，可用「还原默认」清空。</p>
      <textarea ref=${taRef} className="style-input" spellcheck="false"
        placeholder=${'/* 在此粘贴或书写 CSS，例如： */\n.card.card-row { min-height: 40px; padding: 5px 10px; }\n.kind-tag { font-size: 9px; }\n.topbar { background: #faf6ec; }'}></textarea>
      <div className="style-foot">
        <button className="btn ghost sm" onClick=${handleReset}>还原默认</button>
        <div className="spacer"></div>
        <button className="btn ghost sm" onClick=${onClose}>关闭</button>
        <button className="btn primary sm" onClick=${handleSave}>保存</button>
      </div>
    </div>
  </div>`;
}

function App() {
  const [inspirations, setInspirations] = useState([]);
  const [ideaThreads, setIdeaThreads] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [resumeContext, setResumeContext] = useState(null);
  const [saveNotice, setSaveNotice] = useState('');
  const [view, setView] = useState('graph');
  const [selectedId, setSelectedId] = useState(null);
  const [threadTitle, setThreadTitle] = useState(null);
  const [editing, setEditing] = useState(null);
  const [returnHomeAfterSave, setReturnHomeAfterSave] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(null);
  const [kindFilter, setKindFilter] = useState(null);
  const [dismissedEchoes, setDismissedEchoes] = useState(() => new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [threadDialog, setThreadDialog] = useState(null);
  const [pendingThreadTarget, setPendingThreadTarget] = useState(null);
  const [weaving, setWeaving] = useState(null);
  const [themePref, setThemePref] = useState(() => {
    try { return localStorage.getItem('mk-theme') || 'auto'; } catch (_) { return 'auto'; }
  });
  const [userCss, setUserCss] = useState(() => { try { return localStorage.getItem('mk-user-css') || ''; } catch (_) { return ''; } });
  const [styleOpen, setStyleOpen] = useState(false);

  // 夜间林间 — 跟随系统 / 日间 / 夜间，三态循环
  useEffect(() => {
    try { localStorage.setItem('mk-theme', themePref); } catch (_) {}
    const apply = () => {
      const dark = themePref === 'dark' || (themePref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      const m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', dark ? '#161c14' : '#f5f1e6');
    };
    apply();
    if (themePref === 'auto' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => apply();
      if (mq.addEventListener) {
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
      } else if (mq.addListener) {
        mq.addListener(onChange);
        return () => mq.removeListener(onChange);
      }
    }
  }, [themePref]);

  // 用户自定义样式 — 注入 <style id="mk-user-css">，实时生效
  useEffect(() => {
    let el = document.getElementById('mk-user-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'mk-user-css';
      document.head.appendChild(el);
    }
    el.textContent = userCss || '';
  }, [userCss]);
  const cycleTheme = () => setThemePref(p => p === 'auto' ? 'light' : p === 'light' ? 'dark' : 'auto');

  useEffect(() => { (async () => {
    try {
      const [all, savedThreads] = await Promise.all([
        db.getAllInspirations(),
        db.getMeta('mk-idea-threads', []),
      ]);
      setInspirations(all);
      setIdeaThreads(Array.isArray(savedThreads) ? savedThreads : []);
      const draft = await activeDraft().catch(() => null);
      if (draft && (draft.type === 'create' || all.some(n => n.id === draft.noteId))) {
        setResumeContext(draft);
        setEditing(draft.type === 'create' ? 'new' : all.find(n => n.id === draft.noteId));
      }
      setLoaded(true);
    } catch (e) { setLoadError('无法读取账号记录，请检查连接后重试。' + e.message); }
  })(); }, []);

  const index = useMemo(() => buildIndex(inspirations), [inspirations]);
  const ocs = useMemo(() => countBy(inspirations.flatMap(i => inspirationOCs(i))), [inspirations]);
  const tags = useMemo(() => countBy(inspirations.flatMap(i => inspirationTags(i))), [inspirations]);
  const echoes = useMemo(() => anniversaryMatches(inspirations).filter(e => !dismissedEchoes.has(e.insp.id)), [inspirations, dismissedEchoes]);
  const headEcho = echoes[0] || null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inspirations.slice().sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)).filter(i => {
      if (filter) {
        if (filter.type === 'oc' && !inspirationOCs(i).includes(filter.value)) return false;
        if (filter.type === 'tag' && !inspirationTags(i).includes(filter.value)) return false;
      }
      if (kindFilter && kindOf(i) !== kindFilter) return false;
      if (!q) return true;
      const hay = [i.title, latestBody(i), ...inspirationOCs(i), ...inspirationTags(i)].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [inspirations, search, filter, kindFilter]);

  // 同名记录聚拢为「线团」——视图层抽象
  const viewItems = useMemo(() => buildViewItems(filtered), [filtered]);
  const recentHome = useMemo(() => inspirations.slice().sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 3).map(i => {
    const preview = notePreview(i);
    return {
      id: i.id,
      title: preview.title || preview.excerpt || '图片记录',
      excerpt: preview.title ? latestDistinctExcerpt(i, preview.title) : '',
      continuationCount: Math.max(0, (i.entries?.length || 1) - 1),
      timeLabel: fmtDate(i.updatedAt),
    };
  }), [inspirations]);

  // 每个 kind 的数量（用于文件夹 chip 上的数字）
  const kindCounts = useMemo(() => {
    const c = { _all: inspirations.length };
    KINDS.forEach(k => c[k.id] = 0);
    inspirations.forEach(i => { const k = kindOf(i); c[k] = (c[k] || 0) + 1; });
    return c;
  }, [inspirations]);

  const selected = selectedId ? inspirations.find(i => i.id === selectedId) : null;
  // 当前 Thread（同名记录的总览）
  const threadEntries = threadTitle
    ? inspirations.filter(i => (i.title || '').trim() === threadTitle).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    : null;

  const openDetail = (id) => { setSaveNotice(''); setSelectedId(id); setThreadTitle(null); };
  const openNew = (returnHome = false) => {
    setResumeContext(null);
    setReturnHomeAfterSave(returnHome === true);
    setEditing('new');
  };
  const openRecent = (id) => {
    const insp = inspirations.find(i => i.id === id);
    if (!insp) return;
    setSaveNotice('');
    setResumeContext(null);
    setView('list');
    setSelectedId(id);
    setThreadTitle(null);
  };
  const openThread = (title) => { setThreadTitle(title); setSelectedId(null); };
  const backFromThread = () => setThreadTitle(null);
  const handleSave = async (insp) => {
    const goHome = returnHomeAfterSave;
    setSaveNotice('正式记录已保存');
    setResumeContext(null);
    setInspirations(prev => {
      const exists = prev.some(p => p.id === insp.id);
      return exists ? prev.map(p => p.id === insp.id ? insp : p) : [insp, ...prev];
    });
    setEditing(null);
    setReturnHomeAfterSave(false);
    if (goHome) {
      setSelectedId(null);
      setView('graph');
    } else {
      setSelectedId(insp.id);
    }
  };
  const handleQuickSave = async (insp) => {
    insp = await db.saveInspiration(insp);
    setInspirations(prev => [insp, ...prev]);
  };
  const dismissEcho = (id) => setDismissedEchoes(prev => new Set([...prev, id]));
  const handleDelete = async (id) => {
    const insp = inspirations.find(i => i.id === id);
    await db.deleteInspiration(id);
    if (insp && insp.imageId) { try { await db.deleteImage(insp.imageId); imageCache.delete(insp.imageId); } catch (_) {} }
    setInspirations(prev => prev.filter(p => p.id !== id));
    const nextThreads = ideaThreads.map(thread => ({
      ...thread,
      noteIds: (thread.noteIds || []).filter(noteId => noteId !== id),
      updatedAt: Date.now(),
    }));
    await db.setMeta('mk-idea-threads', nextThreads);
    setIdeaThreads(nextThreads);
    setSelectedId(null);
  };
  const handleClearAll = async () => {
    await db.clearAll();
    window.dispatchEvent(new Event('museknot-data-cleared'));
    imageCache.clear();
    setInspirations([]);
    setIdeaThreads([]);
    setSelectedId(null);
    setFilter(null);
    setSearch('');
    setView('list');
  };
  const onOcFromDetail = (name) => { setFilter({ type: 'oc', value: name }); setSelectedId(null); };
  const onTagFromDetail = (name) => { setFilter({ type: 'tag', value: name }); setSelectedId(null); };

  // 编织 — 选择模式 + 编织稿
  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const enterSelectMode = () => { setSelectMode(true); setSelectedIds(new Set()); };
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); setPendingThreadTarget(null); };
  const openWeave = () => {
    const srcs = inspirations.filter(i => selectedIds.has(i.id));
    setWeaving(srcs);
    setSelectMode(false);
  };
  const handleWeaveSave = async (insp) => {
    insp = await db.saveInspiration(insp);
    setInspirations(prev => [insp, ...prev]);
    setWeaving(null);
    setSelectedIds(new Set());
    setSelectedId(insp.id);
  };

  const openThreadDialog = (noteIds = [], targetId = null, editingThread = null) => {
    setThreadDialog({ noteIds: [...new Set(noteIds)], targetId, editingThread });
  };
  const saveIdeaThreads = async next => {
    const ordered = next.slice().sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    await db.setMeta('mk-idea-threads', ordered);
    setIdeaThreads(ordered);
  };
  const handleThreadDialogSave = async ({ name, noteIds, membership, editingId }) => {
    const now = Date.now();
    if (editingId) {
      const fresh = await db.getMeta('mk-idea-threads', []);
      if (JSON.stringify(fresh) !== JSON.stringify(ideaThreads)) throw new Error('脉络已在别处更新，请刷新页面后重新排序。');
      const current = ideaThreads.find(thread => thread.id === editingId);
      if (!current) throw new Error('脉络已变化，请刷新页面后重试。');
      validateOrder(current.noteIds || [], noteIds);
    }
    let next = ideaThreads.map(thread => {
      if (editingId === thread.id) return { ...thread, name, noteIds: [...noteIds], updatedAt: now };
      const choice = membership[thread.id];
      if (choice === true) return { ...thread, noteIds: [...new Set([...(thread.noteIds || []), ...noteIds])], updatedAt: now };
      if (choice === false) return { ...thread, noteIds: (thread.noteIds || []).filter(id => !noteIds.includes(id)), updatedAt: now };
      return thread;
    });
    if (name && !editingId) {
      const existing = next.find(thread => thread.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
      if (existing) next = next.map(thread => thread.id === existing.id
        ? { ...thread, noteIds: [...new Set([...(thread.noteIds || []), ...noteIds])], updatedAt: now }
        : thread);
      else next = [...next, { id: db.uuid(), name, noteIds, createdAt: now, updatedAt: now }];
    }
    await saveIdeaThreads(next);
    setThreadDialog(null);
    setPendingThreadTarget(null);
    setSelectMode(false);
    setSelectedIds(new Set());
    setSelectedId(null);
    setThreadTitle(null);
    setView('connections');
  };
  const removeNoteFromThread = async (threadId, noteId) => {
    const next = ideaThreads.map(thread => thread.id === threadId
      ? { ...thread, noteIds: (thread.noteIds || []).filter(id => id !== noteId), updatedAt: Date.now() }
      : thread);
    try { await saveIdeaThreads(next); }
    catch (_) { setSaveNotice('未能移出脉络，请重试。'); }
  };
  const deleteIdeaThread = async threadId => {
    await saveIdeaThreads(ideaThreads.filter(thread => thread.id !== threadId));
    setThreadDialog(null);
  };
  const beginThreadSelection = (targetId = null) => {
    setView('list');
    setSelectMode(true);
    setSelectedIds(new Set());
    setPendingThreadTarget(targetId);
  };

  if (loadError) return html`<div className="boot"><p role="alert">${loadError}</p><button className="btn" onClick=${() => location.reload()}>重新读取</button></div>`;
  if (!loaded) {
    return html`<div className="boot">
      <svg className="boot-knot" viewBox="0 0 32 32" width="44" height="44" aria-hidden="true">
        <path d="M5 24 C5 15 13 13 16 17 C19 21 27 19 27 11" stroke="#4f7038" strokeWidth="2.6" fill="none" strokeLinecap="round" className="thread-a" />
        <path d="M5 10 C5 19 13 21 16 17 C19 13 27 15 27 23" stroke="#7ea65c" strokeWidth="2.6" fill="none" strokeLinecap="round" className="thread-b" />
        <circle cx="16" cy="17" r="2.2" fill="#c9a052" />
      </svg>
      <p className="boot-slogan-cn">灵感成结，故事生根</p>
      <p className="boot-slogan-en">Tie your scattered muses into a story.</p>
    </div>`;
  }

  const hasSel = !!selected;
  const inThread = !!threadEntries;
  const editingInsp = editing === 'new' ? null : editing;

  return html`<div className=${'app-shell retreat-app' + (view === 'graph' && !hasSel && !inThread ? ' sanctuary-home' : '')}>
    <${Sidebar}
      tags=${tags} ocs=${ocs}
      filter=${filter} onFilter=${value => { setFilter(value); setView('list'); }} onClearFilter=${() => setFilter(null)}
      search=${search} onSearch=${value => { setSearch(value); setView('list'); }} onNew=${openNew} onClearAll=${handleClearAll} total=${inspirations.length}
      themePref=${themePref} onCycleTheme=${cycleTheme} onOpenStyle=${() => setStyleOpen(true)} />
    <main className="main">
      ${saveNotice ? html`<div className="record-success app-save-notice" role="status">${saveNotice}<button className="record-link" onClick=${() => setSaveNotice('')}>关闭</button></div>` : null}
      <${Topbar}
        view=${view} onView=${setView} filter=${filter} search=${search} kindFilter=${kindFilter}
        onBack=${() => { setSelectedId(null); setThreadTitle(null); }} hasSel=${hasSel || inThread} onNew=${openNew}
        count=${inThread ? threadEntries.length : view === 'connections' && !hasSel ? ideaThreads.length : filtered.length} />
      ${!hasSel && !inThread && view === 'list' ? html`<div className="list-filters"><${FolderRow} kindFilter=${kindFilter} onChange=${setKindFilter} counts=${kindCounts} /></div>` : null}
      <div className=${'content' + (((view === 'graph' || view === 'connections') && !hasSel && !inThread) ? ' graph-mode' : '')}>
        ${hasSel
          ? html`<div className="content-inner"><${DetailView} insp=${selected} index=${index} inspirations=${inspirations} onOpen=${openDetail} onEdit=${(i) => setEditing(i)} onDelete=${handleDelete} onOc=${onOcFromDetail} onTag=${onTagFromDetail} onUpdate=${(i) => setInspirations(prev => prev.map(p => p.id === i.id ? i : p))} onOpenThreads=${id => openThreadDialog([id])} /></div>`
          : (inThread
            ? html`<div className="content-inner"><${ThreadView} title=${threadTitle} entries=${threadEntries} onOpen=${openDetail} onNew=${() => { setEditing('new'); }} onAppendHere=${(entry) => { setSelectedId(entry.id); }} /></div>`
            : (view === 'graph'
              ? html`<${Retreat} onNew=${() => openNew(true)} onList=${() => setView('list')} recent=${recentHome} onOpenRecent=${openRecent} />`
              : view === 'connections' ? html`<${ThreadLines} threads=${ideaThreads} inspirations=${inspirations} onOpen=${openDetail}
                  onCreate=${() => beginThreadSelection()} onAdd=${id => beginThreadSelection(id)}
                  onManage=${thread => openThreadDialog([], null, thread)} onRemove=${removeNoteFromThread} />`
              : html`<div className="content-inner">

                  ${!selectMode && headEcho ? html`<${EchoCard} echo=${headEcho} onOpen=${openDetail} onDismiss=${() => dismissEcho(headEcho.insp.id)} />` : null}
                  <${SelectBar} count=${filtered.length} selectMode=${selectMode} selectedCount=${selectedIds.size}
                    onEnter=${enterSelectMode} onWeave=${openWeave} onConnect=${() => openThreadDialog([...selectedIds], pendingThreadTarget)} onCancel=${exitSelectMode} />
                  <${ListView} viewItems=${selectMode ? filtered.map(insp => ({ kind: 'inspiration', insp })) : viewItems} index=${index} onOpenInsp=${openDetail} onOpenThread=${openThread} onNew=${openNew}
                    selectMode=${selectMode} selectedIds=${selectedIds} onToggleSelect=${toggleSelect} />
                </div>`))}
      </div>
    </main>
    ${editing ? html`<${Editor} resumeContext=${resumeContext} insp=${editingInsp} allTitles=${inspirations.map(i => i.title).filter(Boolean)} onSave=${handleSave} onCancel=${() => { setEditing(null); setReturnHomeAfterSave(false); }} defaultKind=${editingInsp ? kindOf(editingInsp) : (kindFilter || 'inspiration')} />` : null}
    ${weaving ? html`<${WeaveEditor} sources=${weaving} onSave=${handleWeaveSave} onCancel=${() => setWeaving(null)} />` : null}
    ${threadDialog ? html`<${ThreadDialog} inspirations=${inspirations} threads=${ideaThreads} selectedIds=${threadDialog.noteIds}
      initialTargetId=${threadDialog.targetId} editingThread=${threadDialog.editingThread} onClose=${() => setThreadDialog(null)}
      onSave=${handleThreadDialogSave} onDelete=${deleteIdeaThread} />` : null}
    ${styleOpen ? html`<${StylePanel} initial=${userCss}
        onChange=${setUserCss}
        onSave=${() => { try { localStorage.setItem('mk-user-css', userCss); } catch (_) {} }}
        onReset=${() => { try { localStorage.removeItem('mk-user-css'); } catch (_) {} }}
        onClose=${() => setStyleOpen(false)} />` : null}
  </div>`;
}

/* ---------- ThreadView (同名记录的总览) ---------- */
function ThreadView({ title, entries, onOpen, onNew, onAppendHere }) {
  const total = entries.length;
  const firstTs = entries[0].createdAt;
  const lastTs = entries[entries.length - 1].updatedAt;
  const spanDays = Math.max(1, Math.round((lastTs - firstTs) / 86400000));
  const spanLabel = spanDays <= 1 ? '同一天的几条' : (spanDays < 30 ? `跨 ${spanDays} 天` : `跨 ${Math.round(spanDays / 30)} 月`);
  // 聚合：所有条目的 OC / tag
  const ocBag = new Map();
  const tagBag = new Map();
  for (const e of entries) {
    for (const o of inspirationOCs(e)) ocBag.set(o, (ocBag.get(o) || 0) + 1);
    for (const t of inspirationTags(e)) tagBag.set(t, (tagBag.get(t) || 0) + 1);
  }
  const moods = entries.filter(e => e.mood).map(e => MOOD_BY_ID[e.mood]);
  return html`<div className="thread-view">
    <div className="thread-head">
      <h1>${title}</h1>
      <div className="thread-head-meta">
        <span className="kind-tag">${KIND_BY_ID[kindOf(entries[0])].rune} ${KIND_BY_ID[kindOf(entries[0])].label}</span>
        <span className="meta-sep">·</span>
        <span>${total} 条 · ${spanLabel}</span>
        <span className="meta-sep">·</span>
        <span>${timeMood(lastTs)} · ${fmtDate(lastTs)}</span>
      </div>
      <p className="thread-head-tip">同名的所有记录汇集在线团里。点开任意一条进入详情查看/编辑；想再加一条同名记录，写的时候标题就用「${title}」——会自然汇入这里。</p>
      <div className="thread-actions-row">
        <button className="btn primary sm" onClick=${onNew}>＋ 为这条线团加一条</button>
      </div>
      ${(moods.length || ocBag.size || tagBag.size) ? html`<div className="chips thread-bags">
        ${moods.map((m, i) => html`<span key=${'m'+i} className="chip oc" style=${{ '--mc': m.color }}>· ${m.label}</span>`)}
        ${[...ocBag.keys()].map(o => html`<span key=${'o'+o} className="chip oc">${o}</span>`)}
        ${[...tagBag.keys()].map(t => html`<span key=${'t'+t} className="chip">${t}</span>`)}
      </div>` : null}
    </div>
    <div className="thread-timeline">
      ${entries.map((e, i) => {
        const text = latestBody(e);
        const preview = text.split('\n').filter(l => l.trim() && !l.startsWith('>')).slice(0, 2).join(' ');
        const isFirst = i === 0;
        return html`<div key=${e.id} className=${'timeline-item' + (isFirst ? ' first' : '') + (i === entries.length - 1 ? ' last' : '')}>
          <div className="timeline-dot"></div>
          <div className="timeline-card" onClick=${() => onOpen(e.id)}>
            <div className="timeline-meta">
              <span className="timeline-no">第 ${i + 1} 段${isFirst ? html`<span className="muted"> · 第一条</span>` : null}</span>
              <span className="timeline-time">${timeMood(e.createdAt)} · ${fmtDate(e.createdAt)}</span>
              ${(e.versions && e.versions.length > 1) ? html`<span className="chip versions-chip">${e.versions.length} 段内部迭代</span>` : null}
            </div>
            <div className="timeline-preview">${preview || html`<span className="muted">（这一条没有正文）</span>`}</div>
            <div className="timeline-foot">
              <span className="timeline-cta">查看详情 / 继续批注 →</span>
            </div>
          </div>
        </div>`;
      })}
    </div>
  </div>`;
}

registerPwa();
createRoot(document.getElementById('app')).render(html`<${ConnectionStatus} /><${AuthGate}><${App} /></${AuthGate}>`);
