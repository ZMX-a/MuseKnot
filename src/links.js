// links.js — parsing, backlinks, graph construction (v2: single body field)
// Recognizes: [[link]] / @OC / #tag  (skeen/线团 merged into #tag for simplicity)

const LINK_RE = /\[\[([^\]]+?)\]\]/g;
const OC_RE = /(?:^|[\s（）()])@([^\s@#,\[\]（）()，。、；：！？\n]+)/g;
const TAG_RE = /(?:^|[\s（）()])#([^\s@#,\[\]（）()，。、；：！？\n]+)/g;

export function extractLinks(text) {
  if (!text) return [];
  const out = [];
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text))) out.push(m[1].trim());
  return out;
}

export function extractOCs(text) {
  if (!text) return [];
  const out = [];
  let m;
  OC_RE.lastIndex = 0;
  while ((m = OC_RE.exec(text))) out.push(m[1].trim());
  return out;
}

export function extractTags(text) {
  if (!text) return [];
  const out = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text))) out.push(m[1].trim());
  return out;
}

// Derive a title from body: first non-empty line, stripped of @OC #tag [[link]] tokens
export function deriveTitle(body) {
  if (!body) return '';
  const lines = body.split('\n');
  for (const raw of lines) {
    const cleaned = raw
      .replace(/\[\[[^\]]+\]\]/g, '')
      .replace(/(?:^|[\s（）()])@[^\s@#,\[\]（）()，。、；：！？\n]+/g, '')
      .replace(/(?:^|[\s（）()])#[^\s@#,\[\]（）()，。、；：！？\n]+/g, '')
      .replace(/^>\s*/, '')
      .trim();
    if (cleaned) return cleaned.slice(0, 60);
  }
  return '';
}

export function inspirationLinks(insp) {
  return [...new Set(extractLinks(insp.body || ''))];
}

export function inspirationOCs(insp) {
  return [...new Set(extractOCs(insp.body || ''))];
}

export function inspirationTags(insp) {
  return [...new Set(extractTags(insp.body || ''))];
}

export function buildIndex(inspirations) {
  const titleToId = new Map();
  const lowerToId = new Map();
  for (const i of inspirations) {
    const t = i.title || deriveTitle(i.body);
    if (!t) continue;
    titleToId.set(t, i.id);
    lowerToId.set(t.toLowerCase(), i.id);
  }
  const resolve = (title) => titleToId.get(title) || lowerToId.get((title || '').toLowerCase());

  const idToLinks = new Map();
  const backlinks = new Map();
  for (const i of inspirations) { idToLinks.set(i.id, []); backlinks.set(i.id, []); }

  for (const i of inspirations) {
    const ids = [];
    for (const t of inspirationLinks(i)) {
      const tid = resolve(t);
      if (tid && tid !== i.id) {
        ids.push(tid);
        if (!backlinks.get(tid).includes(i.id)) backlinks.get(tid).push(i.id);
      }
    }
    idToLinks.set(i.id, [...new Set(ids)]);
  }
  return { resolve, idToLinks, backlinks };
}

export function linkCount(insp, index) {
  const out = (index.idToLinks.get(insp.id) || []).length;
  const back = (index.backlinks.get(insp.id) || []).length;
  return out + back;
}

export function buildGraph(inspirations, index) {
  const nodes = inspirations.map(i => ({ type: 'insp', id: i.id, label: i.title || '未命名', insp: i }));
  const ocSeen = new Set();
  for (const i of inspirations) {
    for (const oc of inspirationOCs(i)) {
      if (!ocSeen.has(oc)) { ocSeen.add(oc); nodes.push({ type: 'oc', id: 'oc::' + oc, label: oc }); }
    }
  }
  const links = [];
  const pairSeen = new Set();
  for (const i of inspirations) {
    for (const tid of (index.idToLinks.get(i.id) || [])) {
      const key = [i.id, tid].sort().join('::');
      if (pairSeen.has(key)) continue;
      pairSeen.add(key);
      links.push({ source: i.id, target: tid });
    }
    for (const oc of inspirationOCs(i)) {
      links.push({ source: i.id, target: 'oc::' + oc });
    }
  }
  return { nodes, links };
}
