import React from 'react';
import htm from 'htm';
const html = htm.bind(React.createElement);

export function Retreat({ onNew, onList, recent = [], onOpenRecent }) {
  return html`<section className="sanctuary" aria-label="MuseKnot 首页">
    <div className="sanctuary-images" aria-hidden="true"><img className="nature-image" src="./assets/tree-illustration.svg" alt="" fetchpriority="high" /></div>
    <div className="sanctuary-wash"></div>
    <header className="sanctuary-header"><span className="sanctuary-brand">MuseKnot</span><button className="sanctuary-library" onClick=${onList}>我的笔记 <span aria-hidden="true">↗</span></button></header>
    <div className="sanctuary-invitation"><h1>在这里，<br/>写一点。</h1><button className="begin-writing" onClick=${onNew} aria-label="记录"><span>＋ 记录</span><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" /></svg></button></div>
    ${recent.length ? html`<section className="sanctuary-recent" aria-label="最近记录">
      <div className="sanctuary-recent-head"><span>最近记录</span><button onClick=${onList}>查看全部</button></div>
      <div className="sanctuary-recent-list">
        ${recent.map(note => html`<button key=${note.id} className="sanctuary-recent-item" onClick=${() => onOpenRecent?.(note.id)}>
          <span className="sanctuary-recent-title">${note.title}</span>
          ${note.excerpt ? html`<span className="sanctuary-recent-excerpt">${note.excerpt}</span>` : null}
          <span className="sanctuary-recent-meta"><time>${note.timeLabel}</time><span>续写 ${note.continuationCount || 0} 次 · 继续写 ↗</span></span>
        </button>`)}
      </div>
    </section>` : null}
    <footer className="sanctuary-footer"><span className="sanctuary-mark">M / K</span></footer>
  </section>`;
}
