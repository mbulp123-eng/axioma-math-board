import {restoreBoards} from '../backup.js';
import {exportRegion,pngSize,pageTiles} from '../export-plan.js';
import {validateFormula,prepareFormula,drawFormula,readyFormula} from '../formula.js';
import {createPointerInput} from '../pointer-input.js';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {drawMathObject,compileExpression,getMathDefaults,normalizeGraphView,zoomGraphAt,resetGraphView,getGraphViewport} from '../math.js';
import {TASK_TOPICS,TASK_LEVELS,generateTasks} from '../tasks.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const elements=new Map(),buttons=[],dataStore=new Map();
let draws=0;
const context2d=new Proxy({font:'24px sans-serif',measureText:t=>({width:String(t).length*14}),globalAlpha:1},{get(o,k){if(k in o)return o[k];return(...args)=>{for(const a of args)if(typeof a==='number')assert(Number.isFinite(a),`Non-finite canvas value in ${k}`);if(k==='drawImage')draws++}},set(o,k,v){o[k]=v;return true}});
function element(tag='div'){
 const el={tagName:tag.toUpperCase(),dataset:{},style:{},children:[],value:'',textContent:'',disabled:false,open:false,files:[],handlers:{},attributes:{},width:1200,height:800};
 const classes=new Set();el.classList={add:(...s)=>s.forEach(x=>classes.add(x)),remove:(...s)=>s.forEach(x=>classes.delete(x)),contains:s=>classes.has(s),toggle(s,v){const on=v??!classes.has(s);on?classes.add(s):classes.delete(s);return on}};
 Object.assign(el,{addEventListener(k,fn){(this.handlers[k]??=[]).push(fn)},dispatch(k,p={}){for(const f of this.handlers[k]||[])f({...p,target:this,preventDefault(){}})},setAttribute(k,v){this.attributes[k]=v},append(...x){this.children.push(...x)},replaceChildren(...x){this.children=x},getBoundingClientRect:()=>({left:0,top:0,width:1200,height:800}),getContext:()=>context2d,setPointerCapture(){},showModal(){this.open=true},close(){this.open=false},focus(){},select(){},scrollTo(){},click(){this.dispatch('click')},matches:()=>false,toBlob:fn=>fn(new Blob(['mock'])),toDataURL:()=>'data:image/png;base64,AA=='});return el;
}
for(const m of html.matchAll(/\bid="([^"]+)"/g))elements.set(m[1],element(m[1]==='board-canvas'?'canvas':'div'));
for(const m of html.matchAll(/<button\b([^>]*)>/g)){const el=element('button');for(const a of m[1].matchAll(/data-([\w-]+)="([^"]+)"/g))el.dataset[a[1]]=a[2];buttons.push(el)}
elements.get('graph-expression').value='x^2';
const selectAll=s=>{const m=s.match(/^\[data-([\w-]+)(?:="([^"]+)")?\]$/);return m?buttons.filter(b=>m[1] in b.dataset&&(!m[2]||b.dataset[m[1]]===m[2])):[]};
const doc={body:element('body'),activeElement:null,handlers:{},getElementById:id=>elements.get(id),querySelectorAll:selectAll,querySelector:s=>selectAll(s)[0],createElement:element,addEventListener(k,fn){this.handlers[k]=fn}};
class FakeImage{constructor(){this.complete=false;this.naturalWidth=100;this.naturalHeight=100}set src(s){this._src=s}get src(){return this._src}async decode(){this.complete=true;return undefined}}
const sandbox={restoreBoards,exportRegion,pngSize,pageTiles,validateFormula,prepareFormula,drawFormula,readyFormula,createPointerInput,initAI:()=>({updateSelection(){},hasFocus:()=>false}),console,document:doc,window:{devicePixelRatio:1,matchMedia:()=>({matches:false}),addEventListener(){},open:()=>null},navigator:{clipboard:{writeText:async()=>{}}},crypto:webcrypto,localStorage:{getItem:k=>dataStore.get(k)||null,setItem:(k,v)=>dataStore.set(k,v)},ResizeObserver:class{constructor(cb){this.cb=cb}observe(){this.cb()}},requestAnimationFrame:fn=>fn(),setTimeout:()=>0,clearTimeout(){},Image:FakeImage,Blob,URL,drawMathObject,compileExpression,getMathDefaults,normalizeGraphView,zoomGraphAt,resetGraphView,TASK_TOPICS,TASK_LEVELS,generateTasks};
vm.createContext(sandbox);
let src=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');src=src.replace(/^import .*?;\n/gm,'').replace('await initStorage();','demo();updateControls();commit();setTool(\'select\');');
src+='\nglobalThis.test={state,chosen,union,hit,commit,undo,setTool,validateScene,render,persist,scheduleSave,exportCanvas,captureAISelection,insertAIBlocks,images,insertTaskSet,taskGeneratorDialog,setDB:x=>db=x,getDirty:()=>dirty};';
vm.runInContext(src,sandbox);
const t=sandbox.test,c=elements.get('board-canvas');
assert(t.state.objects.length>10);t.render();
const before=t.state.objects.length;
t.setTool('pen');
c.dispatch('pointerdown',{button:0,pointerId:1,pointerType:'mouse',clientX:350,clientY:300});
c.dispatch('pointermove',{pointerId:1,clientX:390,clientY:340});
c.dispatch('pointermove',{pointerId:1,clientX:420,clientY:325});
c.dispatch('pointerup',{pointerId:1});
assert.equal(t.state.objects.length,before+1);
const stroke=t.state.objects.at(-1);assert(stroke.points.length===3&&stroke.w===70&&stroke.h===40);assert(t.hit(stroke,{x:stroke.x+30,y:stroke.y+30}));
t.undo(-1);assert.equal(t.state.objects.length,before);t.undo(1);assert.equal(t.state.objects.length,before+1);
t.setTool('rectangle');c.dispatch('pointerdown',{button:0,pointerId:2,pointerType:'mouse',clientX:600,clientY:400});c.dispatch('pointermove',{pointerId:2,clientX:550,clientY:350,shiftKey:true});c.dispatch('pointerup',{pointerId:2});assert.equal(t.state.objects.at(-1).w,50);assert.equal(t.state.objects.at(-1).h,50);
const saved=JSON.parse(JSON.stringify({objects:t.state.objects,title:'Test',view:t.state.view,grid:'grid'}));const restored=t.validateScene(saved);assert.equal(restored.objects.length,saved.objects.length);assert.equal(restored.grid,'grid');
assert.throws(()=>t.validateScene({objects:[{type:'image',x:0,y:0,w:100,h:100,src:'https://bad.test/image.png'}]}));
assert.throws(()=>t.validateScene({objects:[{type:'graph',x:0,y:0,w:100,h:100,expr:'window.alert(1)'}]}));
assert.throws(()=>compileExpression('constructor(x)'));assert.equal(compileExpression('-2^2')(0),-4);assert.equal(compileExpression('2x+1')(3),7);assert.equal(compileExpression('2^3^2')(0),512);
await t.persist();assert(dataStore.has('axioma-boards-v1'));assert.equal(t.getDirty(),false);
let pending=[];t.setDB({transaction(){const tx={objectStore:()=>({put(){}})};pending.push(tx);return tx}});
t.scheduleSave();const first=t.persist();t.scheduleSave();pending.shift().oncomplete();await first;assert.equal(t.getDirty(),true,'Old save must not clear new dirty edits');
const second=t.persist();pending.shift().oncomplete();await second;assert.equal(t.getDirty(),false);
t.state.objects.push({id:'image-test',type:'image',x:0,y:0,w:100,h:100,color:'#243b43',width:2,src:'data:image/png;base64,AA=='});assert(!t.images.has('data:image/png;base64,AA=='));await t.exportCanvas();assert(t.images.get('data:image/png;base64,AA==').complete);assert(draws>0,'Export should draw decoded image');

// Navigation: right mouse must pan even with the pen active and must not edit objects.
t.setDB(null);t.state.view={x:100,y:80,scale:1};t.setTool('pen');const beforePan=JSON.stringify(t.state.objects);
c.dispatch('pointerdown',{button:2,pointerId:3,pointerType:'mouse',clientX:300,clientY:250});
c.dispatch('pointermove',{pointerId:3,clientX:360,clientY:280});c.dispatch('pointerup',{pointerId:3});
assert.equal(t.state.view.x,160);assert.equal(t.state.view.y,110);assert.equal(JSON.stringify(t.state.objects),beforePan);
// Empty-board wheel zoom is gentle and keeps the cursor's world position fixed.
let v={...t.state.view},pointer={clientX:10,clientY:10};const anchorPoint={x:(10-v.x)/v.scale,y:(10-v.y)/v.scale};
c.dispatch('wheel',{...pointer,deltaY:-100,deltaMode:0});
assert(t.state.view.scale>v.scale&&t.state.view.scale<v.scale*1.1);
assert(Math.abs((10-t.state.view.x)/t.state.view.scale-anchorPoint.x)<1e-10);
// Graph zoom changes coordinates inside the fixed frame, not the board camera.
const graph={id:'zoom-test',type:'graph',x:100,y:100,w:400,h:300,color:'#167d8d',width:2,expr:'arctg(x)'};
t.state.objects=[graph];t.state.view={x:0,y:0,scale:1};t.commit();t.setTool('select');
const p={x:340,y:240},gv=getGraphViewport(graph),mathPoint={x:(p.x-gv.cx)/gv.scale,y:(gv.cy-p.y)/gv.scale};
c.dispatch('wheel',{clientX:p.x,clientY:p.y,deltaY:-100,deltaMode:0});
assert.equal(t.state.view.scale,1);assert.equal(graph.w,400);assert.equal(graph.h,300);assert(graph.graphView.spanX<10);
let after=getGraphViewport(graph);assert(Math.abs((p.x-after.cx)/after.scale-mathPoint.x)<1e-10);assert(Math.abs((after.cy-p.y)/after.scale-mathPoint.y)<1e-10);
c.dispatch('wheel',{clientX:p.x,clientY:p.y,deltaY:-100,deltaMode:0});t.undo(-1);assert.equal(getGraphViewport(t.state.objects[0]).spanX,10,'A series of wheel events should undo together');t.undo(1);
const graph2=t.state.objects[0],span=graph2.graphView.spanX;
c.dispatch('wheel',{clientX:p.x,clientY:p.y,deltaY:-100,deltaMode:0,ctrlKey:true});assert(t.state.view.scale>1);assert.equal(graph2.graphView.spanX,span);
// Boundary resize preserves graph viewport; center of right edge changes width only.
t.state.view={x:0,y:0,scale:1};t.state.selected=new Set([graph2.id]);const graphViewBefore=JSON.stringify(graph2.graphView);
c.dispatch('pointerdown',{button:0,pointerId:4,pointerType:'mouse',clientX:500,clientY:250});
c.dispatch('pointermove',{pointerId:4,clientX:560,clientY:250});c.dispatch('pointerup',{pointerId:4});
assert(Math.abs(graph2.w-460)<1e-9);assert(Math.abs(graph2.h-300)<1e-9);assert.equal(JSON.stringify(graph2.graphView),graphViewBefore);
const savedGraph=t.validateScene({objects:[graph2],grid:'dots',view:t.state.view}).objects[0];assert.equal(savedGraph.graphView.spanX,span);
const slider=elements.get('zoom-slider');slider.value='50';slider.dispatch('input');assert(Math.abs(t.state.view.scale-.08*Math.sqrt(75))<1e-10);
for(const [formula,x,want] of [['arcsin(x)',.5,Math.PI/6],['arccos(x)',.5,Math.PI/3],['arctg(x)',1,Math.PI/4],['arcctg(x)',-1,3*Math.PI/4]])assert(Math.abs(compileExpression(formula)(x)-want)<1e-12);
assert(Number.isNaN(compileExpression('asin(x)')(2)));
const samples=generateTasks({topic:'linear',level:'medium',count:3},()=>.42),beforeTasks=t.state.objects.length;
t.insertTaskSet(samples,{topic:'linear',level:'medium',count:3,includeAnswers:false});assert.equal(t.state.objects.length,beforeTasks+5);assert(t.state.objects.at(-1).text.replace(/\s+/g,' ').includes(samples[2].question.replace(/\s+/g,' ')));
t.taskGeneratorDialog();assert(elements.get('modal').open);assert.equal(elements.get('modal-actions').children.length,2);
console.log('PASS: core logic; right-button pan; gentle board wheel; anchored graph zoom; grouped undo; frame resize; slider; graph view roundtrip; inverse functions; task insertion and dialog.');

// AI receives only selected content and adds editable text in one undo transaction.
t.state.selected=new Set([t.state.objects.at(-1).id]);
const selectedSource=await t.captureAISelection();
assert.equal(selectedSource.source,t.state.objects.at(-1).text);assert.equal(selectedSource.image,'');assert.equal(selectedSource.count,1);
const oldCount=t.state.objects.length,oldObjects=JSON.stringify(t.state.objects);
t.insertAIBlocks([{text:'Новые задания',heading:true},{text:'Решите x + 3 = 8'},{text:'Ответы\n1. 5',answers:true}],t.state.id);
assert.equal(t.state.objects.length,oldCount+3);assert(t.chosen().every(o=>o.type==='text'));
assert(t.state.objects.at(-1).x>t.state.objects.at(-2).x);
t.undo(-1);assert.equal(JSON.stringify(t.state.objects),oldObjects);t.undo(1);assert.equal(t.state.objects.length,oldCount+3);
assert.throws(()=>t.insertAIBlocks([{text:'Нельзя'}],'another-board'));
const long='Длинный текст с формулой x² + 1. '.repeat(300);
t.insertAIBlocks([{text:long}],t.state.id);assert(t.chosen().length>1);assert(t.chosen().every(o=>o.text.length<=3500));
assert.equal(t.validateScene({objects:t.chosen(),title:'AI'}).objects.length,t.chosen().length);
console.log('PASS: selected-only AI context, editable insertion, separate answer column, single undo, stale-board guard and long-text save/load.');

// Integration: cancel partial touch edits before pinch, erase rollback, lost capture.
elements.get('modal').close();t.state.objects=[];t.state.view={x:0,y:0,scale:1};t.commit();t.setTool('pen');
const touch=(id,x=100,y=100)=>({pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y});
c.dispatch('pointerdown',touch(10));c.dispatch('pointermove',touch(10,120,120));assert.equal(t.state.objects.length,1);c.dispatch('pointerdown',touch(11,200,200));assert.equal(t.state.objects.length,0,'pinch rolls back draft ink');c.dispatch('pointermove',touch(11,250,250));c.dispatch('pointerup',touch(11));c.dispatch('pointermove',touch(10,130,130));c.dispatch('pointerup',touch(10));assert.equal(t.state.objects.length,0);
t.state.view={x:0,y:0,scale:1};c.dispatch('pointerdown',touch(12));c.dispatch('pointermove',touch(12,140,140));c.dispatch('pointerup',touch(12));assert.equal(t.state.objects.length,1);t.undo(-1);assert.equal(t.state.objects.length,0);t.undo(1);assert.equal(t.state.objects.length,1);
t.setTool('eraser');c.dispatch('pointerdown',touch(13,110,110));assert.equal(t.state.objects.length,0);c.dispatch('lostpointercapture',touch(13));assert.equal(t.state.objects.length,1,'canceled eraser restores objects');
t.setTool('pen');c.dispatch('pointerdown',touch(14,300,300));c.dispatch('pointercancel',touch(14));assert.equal(t.state.objects.length,1);
const oldScene={format:'axioma',version:1,title:'Старый урок',grid:'axes',objects:[{id:'old',type:'text',x:1,y:2,w:120,h:30,text:String.raw`\frac{1}{2}x`,fontSize:26,color:'#243b43'}]};assert.equal(t.validateScene(oldScene).objects[0].type,'text');assert.equal(t.validateScene(oldScene).objects[0].text,oldScene.objects[0].text);
const large={...oldScene,objects:Array.from({length:5000},(_,i)=>({...oldScene.objects[0],x:i*2,y:i%30}))};assert.equal(t.validateScene(large).objects.length,5000);assert.throws(()=>t.validateScene({...large,objects:[...large.objects,large.objects[0]]}));
console.log('PASS: integrated touch drawing/undo, pinch draft rollback, eraser lost-capture rollback, legacy text preservation and 5000-object validation.');
// Storage errors must not clear dirty state or advertise success.
t.setDB(null);const normalSet=sandbox.localStorage.setItem;sandbox.localStorage.setItem=()=>{throw Error('QuotaExceededError')};t.scheduleSave();await t.persist();assert(t.getDirty());assert(elements.get('save-status').classList.contains('save-error'));assert(!elements.get('save-status').textContent.includes('Сохранено'));sandbox.localStorage.setItem=normalSet;await t.persist();assert(!t.getDirty());
console.log('PASS: quota failure retains dirty state and offers file backup; successful retry clears it.');
t.setTool('pen');const beforeEscape=JSON.stringify(t.state.objects);c.dispatch('pointerdown',touch(19,400,400));doc.handlers.keydown({key:'Escape',preventDefault(){}});assert.equal(JSON.stringify(t.state.objects),beforeEscape);t.undo(-1);t.undo(1);assert.equal(JSON.stringify(t.state.objects),beforeEscape,'Escape must not put canceled ink into redo');
console.log('PASS: Escape cancels active ink without creating an undo/redo entry.');
