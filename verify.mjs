import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { GraphView } from './src/forest.js';
import { arrangeForest, demoGraph } from './src/forest-data.js';
import { buildIndex, buildGraph } from './src/links.js';
import { Retreat } from './src/retreat.js';
import { notePreview } from './src/note-preview.js';
import { EntryTimeline } from './src/journal.js';
import { readFile } from 'node:fs/promises';
const notes=[{id:'a',title:'车站',body:'等一封信 [[信]] @等待'},{id:'b',title:'信',body:'给十年前的自己 @等待'}];
const graph=buildGraph(notes,buildIndex(notes));
assert.equal(graph.nodes.length,3);
assert.equal(graph.links.length,3);
const saved=JSON.stringify(graph);
const layout=arrangeForest(graph);
assert.equal(JSON.stringify(graph),saved,'layout must not mutate source graph');
assert.deepEqual(arrangeForest(graph),layout,'layout is stable');
assert(layout.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.z)&&n.scale>0));
assert.equal(arrangeForest({nodes:[],links:[]}).nodes.length,0);
assert.equal(new Set(demoGraph.nodes.map(n=>n.id)).size,demoGraph.nodes.length);
assert(demoGraph.links.every(l=>demoGraph.nodes.some(n=>n.id===l.source)&&demoGraph.nodes.some(n=>n.id===l.target)));
const render=props=>renderToString(React.createElement(GraphView,{onSelect:()=>{},onNew:()=>{},onList:()=>{},...props}));
assert.match(render({graph:{nodes:[],links:[]},allowDemo:true}),/示例森林/);
assert.match(render({graph:{nodes:[],links:[]},allowDemo:false}),/没有匹配的灵感/);
const real=render({graph,allowDemo:false});
assert.match(real.replaceAll('<!-- -->',''),/2 条灵感/);
assert.doesNotMatch(real,/示例片段/);
assert.match(real,/aria-label="向左旋转"/);
console.log('PASS: links, stable spatial layout, data isolation, demo/empty/real states, accessible controls.');
const home=renderToString(React.createElement(Retreat,{onNew:()=>{},onList:()=>{}}));
assert.match(home,/tree-illustration.svg/);
assert.doesNotMatch(home,/示例|season-picker|季节|雨停之后|等待/);
assert.match(home,/记录/);
assert.match(home,/我的笔记/);
const recentHome = renderToString(React.createElement(Retreat, {
  onNew:()=>{}, onList:()=>{},
  recent:[{id:'recent-1',title:'一条新灵感',excerpt:'先记下来，之后再继续写。',timeLabel:'刚刚'}],
  onOpenRecent:()=>{}
}));
assert.match(recentHome,/最近记录/);
assert.match(recentHome,/一条新灵感/);
assert.match(recentHome,/继续写/);
assert.deepEqual(notePreview({body:'一小句足够了。'}),{title:'',excerpt:'一小句足够了。'});
assert.deepEqual(notePreview({body:'',imageId:'photo'}),{title:'',excerpt:''});
assert.deepEqual(notePreview({title:'片段',body:'片段\n第二行\n第三行'}),{title:'片段',excerpt:'第二行 第三行'});
const timeline=renderToString(React.createElement(EntryTimeline,{note:{
  id:'timeline',schemaVersion:2,entries:[
    {id:'a',body:'首次正文',createdAt:1,revision:0,revisions:[]},
    {id:'b',body:'独立补充',createdAt:2,revision:1,updatedAt:3,revisions:[{id:'r',body:'修改前',savedAt:2}]}
  ]
}})).replaceAll('<!-- -->','');
assert.match(timeline,/首次记录/);
assert.match(timeline,/第 1 次续写/);
assert.match(timeline,/独立补充/);
assert.match(timeline,/修改前/);
assert.match(timeline,/已编辑/);
console.log('PASS: home, note previews, independent timeline and visible edit history.');
