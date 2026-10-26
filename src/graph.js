// graph.js — force-directed relationship graph (d3-force + SVG)
import React, { useState, useEffect, useRef } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';
import htm from 'htm';
import { treePaths } from './growth.js';

const html = htm.bind(React.createElement);
const W = 980, H = 640;

// map link degree to growth stage (graph uses links-only, consistent with growth thresholds)
function degToStage(deg) {
  if (deg >= 12) return 4;
  if (deg >= 6) return 3;
  if (deg >= 3) return 2;
  if (deg >= 1) return 1;
  return 0;
}

/* rope link path: quadratic curve with deterministic perpendicular bow */
function ropePath(s, t, i) {
  const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
  const dx = t.x - s.x, dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = (i % 2 === 0 ? 1 : -1) * Math.min(len * 0.09, 14);
  const cx = mx - (dy / len) * bow, cy = my + (dx / len) * bow;
  return `M${s.x} ${s.y} Q${cx} ${cy} ${t.x} ${t.y}`;
}

export function GraphView({ graph, onSelect, onOc, selectedId }) {
  const svgRef = useRef(null);
  const [, setTick] = useState(0);
  const nodesRef = useRef([]);
  const simRef = useRef(null);
  const draggingRef = useRef(null);

  useEffect(() => {
    const degMap = new Map();
    for (const l of graph.links) {
      degMap.set(l.source, (degMap.get(l.source) || 0) + 1);
      degMap.set(l.target, (degMap.get(l.target) || 0) + 1);
    }
    const nodes = graph.nodes.map(n => ({
      ...n,
      deg: degMap.get(n.id) || 0,
      x: W / 2 + (Math.random() - 0.5) * 240,
      y: H / 2 + (Math.random() - 0.5) * 180,
    }));
    const links = graph.links.map(l => ({ ...l }));
    nodesRef.current = nodes;

    const sim = forceSimulation(nodes)
      .force('link', forceLink(links).id(d => d.id)
        .distance(l => (l.source.type === 'oc' || l.target.type === 'oc') ? 56 : 98)
        .strength(0.4))
      .force('charge', forceManyBody().strength(-340))
      .force('collide', forceCollide().radius(d => d.type === 'oc' ? 24 : 30))
      .force('x', forceX(W / 2).strength(0.05))
      .force('y', forceY(H / 2).strength(0.07))
      .force('center', forceCenter(W / 2, H / 2));
    sim.on('tick', () => setTick(t => t + 1));
    simRef.current = sim;
    return () => sim.stop();
  }, [graph]);

  const toSvg = (cx, cy) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const onNodeDown = (e, node) => {
    e.stopPropagation();
    const p = toSvg(e.clientX, e.clientY);
    node.fx = p.x; node.fy = p.y;
    draggingRef.current = node;
    simRef.current && simRef.current.alphaTarget(0.3).restart();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const onMove = (e) => {
    const node = draggingRef.current;
    if (!node) return;
    const p = toSvg(e.clientX, e.clientY);
    node.fx = p.x; node.fy = p.y;
  };
  const onUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current.fx = null;
    draggingRef.current.fy = null;
    draggingRef.current = null;
    simRef.current && simRef.current.alphaTarget(0);
  };

  const nodes = nodesRef.current;
  if (!nodes.length) {
    return html`<div className="empty-state">
      <p>还没有灵感可以织起来。<br/>先系上第一个结吧。</p>
    </div>`;
  }

  return html`<div className="graph-wrap">
    <svg className="graph-svg" ref=${svgRef} viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"
      onPointerMove=${onMove} onPointerUp=${onUp} onPointerLeave=${onUp}>
      <g className="links">
        ${graph.links.map((l, i) => {
          const s = l.source, t = l.target;
          if (typeof s !== 'object' || typeof t !== 'object') return null;
          const d = ropePath(s, t, i);
          return html`<g key=${i}>
            <path className="glink-rope" d=${d} />
            <path className="glink-twist" d=${d} style=${{ animationDelay: `${(i % 7) * -3}s` }} />
          </g>`;
        })}
      </g>
      <g className="nodes">
        ${nodes.map((n) => n.type === 'oc' ? html`<g key=${n.id} className="gnode" transform=${`translate(${n.x},${n.y})`}
              onPointerDown=${(e) => onNodeDown(e, n)} onClick=${() => onOc && onOc(n.label)}>
            <circle className="gnode-oc-circle" r="15" />
            <text className="gnode-oc-label" y="4">${(n.label || '?').slice(0, 1)}</text>
            <text className="gnode-label" y="30">${n.label}</text>
          </g>`
          : html`<g key=${n.id} className="gnode gnode-insp" transform=${`translate(${n.x},${n.y})`}
              onPointerDown=${(e) => onNodeDown(e, n)} onClick=${() => onSelect(n.id)}>
            <${NodeShape} n=${n} selected=${selectedId === n.id} />
            <text className="gnode-label" y=${(14 + degToStage(n.deg || 0) * 3) + 13}>${n.label}</text>
          </g>`)}
      </g>
    </svg>
    <div className="graph-legend">
      <div className="row"><span className="sw" style=${{ background: '#fdfbf4', border: '1.5px solid #a4c07e' }}></span> 灵感（树越大＝编织越多）</div>
      <div className="row"><span className="sw" style=${{ background: '#efd9c6', border: '1.5px solid #b97c4e' }}></span> 意象（角色/梦境/符号……）</div>
      <div className="row" style=${{ color: 'var(--muted)', fontSize: '11px' }}>绳线相连 · 拖动节点可重新排布</div>
    </div>
  </div>`;
}

function NodeShape({ n, selected }) {
  const stage = degToStage(n.deg || 0);
  const r = 14 + stage * 3;
  return html`<g>
    <circle className="gnode-ring" r=${r} fill=${selected ? '#e7dfc9' : '#fdfbf4'} stroke=${selected ? '#4f7038' : '#a4c07e'} strokeWidth=${selected ? 2.5 : 1.5} />
    <g transform=${`translate(${-r * 0.7},${-r * 0.7}) scale(${(r * 1.4) / 32})`}>${treePaths(stage, false)}</g>
  </g>`;
}
