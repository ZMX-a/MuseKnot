// Preview content is kept outside the user's stored notes.
export const demoGraph = {
  nodes: [
    { id: 'd1', label: '雨停之后的车站', type: 'insp', insp: { body: '雨停了，车站却仍然有潮水的声音。她在最后一班车前，收到了十年前寄出的信。', kind: 'inspiration' } },
    { id: 'd2', label: '替人保管梦的人', type: 'insp', insp: { body: '他经营一家失物招领处，只接收人们醒来后遗忘的梦。', kind: 'oc' } },
    { id: 'd3', label: '海边的旧房子', type: 'insp', insp: { body: '窗台上的盐，一夜之间结成了小小的森林。远处有人叫我的名字。', kind: 'dream' } },
    { id: 'd4', label: '一封迟到的信', type: 'insp', insp: { body: '“如果你还能看见这片海，就替我再等一个夏天。”', kind: 'essay' } },
    { id: 'd5', label: '没有告别的夏天', type: 'insp', insp: { body: '把车站、旧房子和那封信编成一个关于等待的故事。', type: 'weave' } },
    { id: 'd6', label: '黄昏里的微光', type: 'insp', insp: { body: '今天路过一家快关门的花店。店主把最后一束花送给了等公交的人。', kind: 'diary' } },
    { id: 'd7', label: '走廊尽头的门', type: 'insp', insp: { body: '每开一扇门，都会回到一个曾经没有做出的选择。', kind: 'dream' } },
    { id: 'o1', label: '等待', type: 'oc' },
    { id: 'o2', label: '海', type: 'oc' },
  ],
  links: [['d1','d4'],['d4','d5'],['d3','d5'],['d1','d5'],['d2','d7'],['d3','o2'],['d4','o1'],['d6','o1'],['d1','o1']].map(([source,target]) => ({source,target})),
};

export function arrangeForest(graph) {
  const degrees = new Map(graph.nodes.map(n => [n.id, 0]));
  for (const l of graph.links) {
    degrees.set(l.source, (degrees.get(l.source) || 0) + 1);
    degrees.set(l.target, (degrees.get(l.target) || 0) + 1);
  }
  const radius = Math.max(6.7, Math.sqrt(graph.nodes.length) * 1.65);
  const ordered = [...graph.nodes].sort((a,b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0) || a.id.localeCompare(b.id));
  return { radius, nodes: ordered.map((n,i) => {
    const angle = i * 2.399963229728653;
    const r = i === 0 ? 0 : Math.sqrt(i / Math.max(1, ordered.length-1)) * radius * .76;
    const degree = degrees.get(n.id) || 0;
    return { ...n, x: Math.cos(angle)*r, z: Math.sin(angle)*r, degree, scale: .7 + Math.min(degree, 12)*.065 };
  }) };
}
