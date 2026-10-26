// growth.js — 5-stage tree growth system (SVG path morphing + CSS keyframes)
import React from 'react';
import htm from 'htm';
import { linkCount } from './links.js';

const html = htm.bind(React.createElement);

export const STAGES = [
  { name: '芽', desc: '刚系上的芽，一片嫩叶', leaf: '#d4e8a0', stem: '#8aab6a' },
  { name: '嫩枝', desc: '嫩枝初展，两片叶', leaf: '#a8c686', stem: '#6b8e4e' },
  { name: '小树', desc: '枝叶渐密', leaf: '#7da55a', stem: '#4f7038' },
  { name: '成树', desc: '枝繁叶茂，树冠成型', leaf: '#4f7038', stem: '#3a5630' },
  { name: '茂林', desc: '深绿带金，微光呼吸', leaf: '#3a5630', stem: '#2d4426', gold: '#c9a052' },
];

// Compute growth stage 0-4 from inspiration content + link count
export function growthStage(insp, index) {
  if (!insp) return 0;
  const lc = index ? linkCount(insp, index) : 0;
  const len = (insp.body || '').length;
  const imgs = insp.imageId ? 1 : 0;
  if (lc >= 12 || len > 800) return 4;
  if (lc >= 6 || len > 300 || imgs >= 1) return 3;
  if (lc >= 3 || len > 150) return 2;
  if (lc >= 1 || len > 50) return 1;
  return 0;
}

// Tree geometry per stage. viewBox 0 0 32 32, stem grows from bottom (30) upward.
const TREES = [
  // 0: 芽 — short stem + one curled leaf
  {
    stems: [{ d: 'M16 30 V23', w: 1.8 }],
    leaves: [{ cx: 16, cy: 21, rx: 3, ry: 4, rot: -15 }],
  },
  // 1: 嫩枝 — taller stem + 2 leaves
  {
    stems: [{ d: 'M16 30 V18', w: 2 }],
    leaves: [
      { cx: 13, cy: 21, rx: 3.5, ry: 4.5, rot: -35 },
      { cx: 19, cy: 18, rx: 3.5, ry: 4.5, rot: 35 },
    ],
  },
  // 2: 小树 — trunk + 2 branches + 4 leaves
  {
    stems: [
      { d: 'M16 30 V15', w: 2.2 },
      { d: 'M16 22 Q12 20 9 17', w: 1.6 },
      { d: 'M16 18 Q20 16 23 13', w: 1.6 },
    ],
    leaves: [
      { cx: 9, cy: 16, rx: 3, ry: 3.8, rot: -45 },
      { cx: 23, cy: 12, rx: 3, ry: 3.8, rot: 45 },
      { cx: 13, cy: 14, rx: 2.8, ry: 3.5, rot: -20 },
      { cx: 20, cy: 13, rx: 2.8, ry: 3.5, rot: 20 },
    ],
  },
  // 3: 成树 — full canopy
  {
    stems: [
      { d: 'M16 30 V11', w: 2.4 },
      { d: 'M16 23 Q11 21 7 17', w: 1.6 },
      { d: 'M16 19 Q21 17 25 13', w: 1.6 },
      { d: 'M16 15 Q13 13 10 9', w: 1.4 },
      { d: 'M16 14 Q19 12 22 8', w: 1.4 },
    ],
    leaves: [
      { cx: 7, cy: 16, rx: 3.5, ry: 4, rot: -50 },
      { cx: 25, cy: 12, rx: 3.5, ry: 4, rot: 50 },
      { cx: 10, cy: 8, rx: 3, ry: 3.5, rot: -30 },
      { cx: 22, cy: 7, rx: 3, ry: 3.5, rot: 30 },
      { cx: 16, cy: 9, rx: 3.5, ry: 4, rot: 0 },
      { cx: 12, cy: 12, rx: 2.8, ry: 3.2, rot: -25 },
      { cx: 20, cy: 11, rx: 2.8, ry: 3.2, rot: 25 },
    ],
  },
];

// stage 4 reuses stage 3 geometry + gold edge + glow
const STAGE4 = { ...TREES[3], gold: true };

// Render tree elements (stems + leaves + optional glow) without <svg> wrapper.
// Used by graph.js nodes which are inside <g>.
export function treePaths(stage, animate = false) {
  const s = Math.max(0, Math.min(4, Math.round(stage)));
  const tree = s === 4 ? STAGE4 : TREES[s];
  const palette = STAGES[s];
  const anim = animate ? ' anim' : '';

  const stemEls = tree.stems.map((st, i) =>
    html`<path key=${'s' + i} className=${'tree-stem' + anim} d=${st.d}
      stroke=${palette.stem} strokeWidth=${st.w} strokeLinecap="round" fill="none"
      style=${animate ? { animationDelay: `${i * 0.12}s` } : null} />`
  );
  const leafEls = tree.leaves.map((lf, i) =>
    html`<g key=${'l' + i} transform=${`rotate(${lf.rot} ${lf.cx} ${lf.cy})`}>
      <ellipse className=${'tree-leaf' + anim} cx=${lf.cx} cy=${lf.cy} rx=${lf.rx} ry=${lf.ry}
        fill=${palette.leaf}
        style=${animate ? { animationDelay: `${0.3 + i * 0.1}s`, transformOrigin: `${lf.cx}px ${lf.cy}px` } : null} />
    </g>`
  );
  const glow = (s >= 4 && palette.gold) ? html`<circle key="glow" className="tree-glow" cx="16" cy="11" r="13"
    fill="none" stroke=${palette.gold} strokeWidth="0.6" opacity="0.5" />` : null;

  return [glow, ...stemEls, ...leafEls];
}

export function TreeSVG({ stage = 0, animate = false, size = 32, className = '' }) {
  return html`<svg className=${'tree-svg ' + className} width=${size} height=${size}
    viewBox="0 0 32 32" aria-hidden="true">
    ${treePaths(stage, animate)}
  </svg>`;
}
