// Persist LaTeX only. SVG is generated locally from trusted MathJax code, never imported.
const cache=new Map();let ready;
export function validateFormula(value){
 const text=String(value||'').trim();
 if(!text||text.length>2000)throw Error('Формула: от 1 до 2000 символов');
 if(/\\(?:href|url|html\w*|style|class|cssId|require|includegraphics|unicode|def|gdef|edef|let|newcommand|renewcommand|newenvironment|verb|bbox)\b/i.test(text)||/[<>\u0000-\u0008]/.test(text))throw Error('Команды ссылок, HTML и определения макросов не поддерживаются');
 let depth=0;for(let i=0;i<text.length;i++){const c=text[i];if(c==='\\'){i++;continue;}if(c==='{')depth++;if(c==='}')depth--;if(depth<0||depth>40)throw Error('Проверьте вложенность скобок в формуле')}if(depth)throw Error('Не закрыта фигурная скобка');return text;
}
async function localBundle(){
 if(!globalThis.DecompressionStream)throw Error('Для формул нужен современный браузер с поддержкой gzip (обновите браузер). Доска продолжает работать.');
 const base=new URL('./vendor/mathjax-3.2.2/',import.meta.url),response=await fetch(new URL('manifest.json',base));if(!response.ok)throw Error('Не найден локальный пакет формул');
 const manifest=await response.json();if(manifest.sha256!=='3980954338a97dc0c2bbf6d69e0ffb5f8bb3a5f81a06b337c888e7a6a2fb7151'||manifest.parts.length!==12)throw Error('Неверный пакет формул');
 const parts=[];for(let i=0;i<12;i++){const r=await fetch(new URL('tex-svg.gz.part-'+String(i).padStart(2,'0'),base));if(!r.ok)throw Error('Не удалось загрузить пакет формул');parts.push(await r.arrayBuffer())}
 const bytes=await new Response(new Blob(parts).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==manifest.sha256)throw Error('Пакет формул повреждён');
 return URL.createObjectURL(new Blob([bytes],{type:'text/javascript'}));
}
function load(){
 if(!ready)ready=new Promise((resolve,reject)=>{
  window.MathJax={startup:{typeset:false},tex:{packages:{'[-]':['autoload','require','newcommand','configmacros','noundefined']},maxMacros:1000,maxBuffer:4096,formatError:(_jax,e)=>{throw e}},svg:{fontCache:'none'},options:{enableMenu:false}};
  const script=document.createElement('script');let sourceURL;localBundle().then(url=>{sourceURL=url;script.src=url;document.head.append(script)},e=>{ready=null;reject(e)});
  script.onload=()=>{URL.revokeObjectURL(sourceURL);window.MathJax.startup.promise.then(()=>resolve(window.MathJax),reject)};script.onerror=()=>{ready=null;reject(Error('Не удалось загрузить локальный редактор формул'))};
 });return ready;
}
const key=o=>`${o.color}|${o.latex}`;
export async function prepareFormula(o){
 const latex=validateFormula(o.latex),k=key(o);if(cache.has(k))return cache.get(k);
 const task=(async()=>{const mj=await load();const node=mj.tex2svg(latex,{display:true,em:32,ex:16,containerWidth:1200});const svg=node.querySelector('svg');if(!svg||svg.querySelector('[data-mml-node="merror"]'))throw Error('Неизвестная команда LaTeX');
 const values=svg.getAttribute('viewBox').split(/[ ,]+/).map(Number),w=values[2]*.032,h=values[3]*.032;
 if(!Number.isFinite(w+h)||w<=0||h<=0||w>6000||h>3000||svg.querySelectorAll('*').length>12000)throw Error('Формула слишком велика: разделите её на несколько объектов');
 svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('width',String(w));svg.setAttribute('height',String(h));svg.style.color=/^#[0-9a-f]{6}$/i.test(o.color)?o.color:'#243b43';
 const source=new XMLSerializer().serializeToString(svg),image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(source);await image.decode();return{image,w,h};})();
 cache.set(k,task);if(cache.size>128)cache.delete(cache.keys().next().value);try{return await task}catch(e){cache.delete(k);throw e}
}
const rendered=new WeakMap(),pending=new WeakSet();
export function drawFormula(ctx,o,refresh){
 const k=key(o),saved=rendered.get(o),item=saved?.key===k?saved:null;
 if(item?.image){ctx.drawImage(item.image,o.x,o.y,o.w,o.h);return}
 ctx.font='16px system-ui';ctx.fillStyle='#243b43';ctx.fillText(item?.error||'Формула…',o.x,o.y+18);
 if(!item&&!pending.has(o)){pending.add(o);prepareFormula(o).then(result=>rendered.set(o,{...result,key:k}),e=>rendered.set(o,{error:e.message,key:k})).finally(()=>{pending.delete(o);refresh()})}
}
export async function readyFormula(o){const item=await prepareFormula(o);rendered.set(o,{...item,key:key(o)});return item}
