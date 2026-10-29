import assert from 'node:assert/strict';
import {compileExpression,drawMathObject,getGraphViewport} from '../math.js';
import {createPointerInput} from '../pointer-input.js';
import {exportRegion,pngSize,pageTiles} from '../export-plan.js';
import {restoreBoards} from '../backup.js';
import {validateFormula} from '../formula.js';
const close=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
for(const [s,x,y] of [['x^(1/3)',-8,-2],['x^(2/3)',-8,4],['x^(-1/3)',-8,-.5],['x^(2/6)',-8,-2],['cbrt(x)',-27,-3],['-2^2',0,-4],['2^3^2',0,512],['sin(pi/2)',0,1],['asin(1)',0,Math.PI/2],['acos(-1)',0,Math.PI],['ln(e)',0,1]])close(compileExpression(s)(x),y);
for(const s of ['sqrt(-1)','ln(-1)','log(0)','asin(2)','acos(-2)','(-8)^(1/2)','(-8)^0.3333333333333333','0^0','1/0','tan(pi/2)'])assert(!Number.isFinite(compileExpression(s)(0)),s);
for(const s of ['alert(1)','globalThis','x.constructor','x;1','(()=>1)()','sqrt(x]'])assert.throws(()=>compileExpression(s));
// Record actual graph path segments, separating them from axes by stroke color.
for(const expr of ['1/x','tan(x)'])for(const centerX of [0,.123,1.57])for(const spanX of [2,20,80]){
 const o={type:'graph',x:0,y:0,w:620,h:400,color:'#123456',expr,graphView:{centerX,centerY:0,spanX}},segments=[];let start,clipped=false;
 const ctx=new Proxy({globalAlpha:1,clip(){clipped=true},measureText:()=>({width:20}),moveTo(x,y){start=[x,y]},lineTo(x,y){if(clipped&&this.strokeStyle===o.color&&start)segments.push([start,[x,y]]);start=[x,y]}},{get:(t,k)=>k in t?t[k]:()=>{},set:(t,k,v)=>(t[k]=v,true)});
 drawMathObject(ctx,o);const v=getGraphViewport(o);if(spanX>2)assert(segments.length>0);
 const world=px=>v.xMin+(px-v.left)/v.scale;
 for(const [a,b] of segments){const x1=world(a[0]),x2=world(b[0]);if(expr==='1/x')assert(!(x1<0&&x2>0),'1/x bridged its pole');else for(let n=-30;n<=30;n++){const pole=Math.PI/2+n*Math.PI;assert(!(x1<pole-1e-10&&x2>pole+1e-10),'tan bridged pole')}}
}
function harness(){const log=[],target={addEventListener(){},setPointerCapture(){}},h=createPointerInput(target,{point:e=>({x:e.clientX,y:e.clientY}),view:()=>({x:0,y:0,scale:1}),start:e=>log.push(['start',e.pointerType]),move:()=>log.push(['move']),end:c=>log.push(['end',c]),navigate:v=>log.push(['nav',v]),navigationEnd:()=>log.push(['navend'])});return{log,...h.handlers,cancel:h.cancel}}
const ev=(id,type='touch',x=0,y=0)=>({pointerId:id,pointerType:type,button:0,clientX:x,clientY:y,preventDefault(){}});
let h=harness();h.down(ev(1));h.move(ev(1,'touch',5));h.finish(ev(1));assert.deepEqual(h.log,[['start','touch'],['move'],['end',false]]);
h=harness();h.down(ev(1));h.move(ev(1,'touch',2));h.down(ev(2,'touch',10));h.move(ev(2,'touch',20));assert(h.log.some(x=>x[0]==='end'&&x[1]===true));assert(h.log.some(x=>x[0]==='nav'&&x[1].scale>1));h.finish(ev(2));const n=h.log.length;h.move(ev(1,'touch',30));h.finish(ev(1));assert.equal(h.log.length,n,'remaining finger cannot draw');h.down(ev(3));assert.equal(h.log.at(-1)[0],'start');
h=harness();h.down(ev(1));h.down(ev(2,'pen'));h.down(ev(3));h.move(ev(3));h.move(ev(2,'pen',12));h.finish(ev(2,'pen'));h.finish(ev(3));h.finish(ev(1));assert.deepEqual(h.log,[['start','touch'],['end',true],['start','pen'],['move'],['end',false]]);
for(const reason of ['cancel','lostcapture']){h=harness();h.down(ev(1));h.finish(ev(1),true);h.finish(ev(1),true);assert.deepEqual(h.log,[['start','touch'],['end',true]],reason)}
h=harness();h.down(ev(1,'mouse'));h.cancel();assert.deepEqual(h.log,[['start','mouse'],['end',true]]);
const region=exportRegion({x:-100,y:50,w:2000,h:1400});assert.deepEqual(region,{x:-140,y:10,w:2080,h:1480});const pages=pageTiles(region);assert.equal(pages.length,9);assert.equal(pages[8].x,1860);assert.equal(pages[8].y,1310);assert.deepEqual(pngSize({w:800,h:400},2),{width:1600,height:800,scale:2});assert.throws(()=>pngSize({w:10000,h:10000},1));assert.throws(()=>pageTiles({w:100000,h:100000}));
let counter=0;const old={id:'existing',title:'Урок',objects:[]};const restored=restoreBoards({format:'axioma-backup',version:1,boards:[old,old]},b=>({...b}),()=>String(++counter),123);assert.equal(old.id,'existing');assert.equal(new Set(restored.map(b=>b.id)).size,2);assert(restored.every(b=>b.title.includes('восстановлено')));assert.throws(()=>restoreBoards({format:'axioma-backup',version:1,boards:[old,null]},b=>{if(!b)throw Error('invalid');return b},()=>String(++counter)));
for(const latex of [String.raw`\left\{x\right\}`,String.raw`\frac{1}{2}x`,String.raw`\sqrt[3]{x}`,String.raw`a_{n}^{2}`,String.raw`\begin{cases}x+y=3\\x-y=1\end{cases}`])assert.equal(validateFormula(latex),latex);
for(const latex of [String.raw`\href{https://x}{x}`,String.raw`\require{html}`,String.raw`\newcommand{\a}{x}`,String.raw`\frac{1`, '<script>','{'.repeat(41)+'x'+'}'.repeat(41)])assert.throws(()=>validateFormula(latex));
console.log('PASS: real rational powers/domains/safe syntax; 18 graph pole cases; single/multi-touch, pen priority/cancellation; bounded PNG/pagination; non-overwriting restore; formula input safety. No physical device or browser raster claim.');
