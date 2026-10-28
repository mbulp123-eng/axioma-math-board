// Real headless engines on CI, against this checkout only. No live AI calls.
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('.');
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[extname(path)]||'application/octet-stream');res.end(await readFile(path))}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;await mkdir('test-results',{recursive:true});
const logs=[];
try{for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
 const browser=await engine.launch();try{for(const [w,h] of [[1440,900],[768,1024],[390,844],[844,390],[320,480]]){
  const context=await browser.newContext({viewport:{width:w,height:h},acceptDownloads:true,hasTouch:true});const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
  await page.goto(base);await page.locator('#save-status').filter({hasText:'Сохранено в браузере'}).waitFor();
  const menu=page.getByRole('button',{name:'Меню: доски, файлы, экспорт и инструменты'});await menu.click();
  for(const text of ['Новый урок','Открыть .axioma','Скачать эту доску','Экспорт PNG','Печать / PDF','Справка','Математическая формула'])assert.equal(await page.getByRole('button',{name:text,exact:true}).count(),1);
  await page.getByRole('button',{name:'Математическая формула',exact:true}).click();await page.locator('.formula-preview img').waitFor();
  const latex=String.raw`\begin{cases}\frac{x_1}{2}+\sqrt{x}=3\\x^2=4\end{cases}`;
  await page.getByRole('textbox',{name:'Формула LaTeX'}).fill(latex);await page.waitForFunction(()=>document.querySelector('.formula-preview img')?.alt.includes('cases'));
  await page.getByRole('button',{name:'Добавить / сохранить'}).click();await page.locator('#modal').waitFor({state:'hidden'});
  // Download/parse real .axioma; round-trip through actual file input.
  await menu.click();const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать эту доску',exact:true}).click();const file=await dl;const saved=JSON.parse(await readFile(await file.path(),'utf8'));assert(saved.objects.some(o=>o.type==='formula'&&o.latex===latex));
  await page.locator('#project-input').setInputFiles({name:'roundtrip.axioma',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.getByText('Доска открыта как отдельный урок',{exact:true}).waitFor();
  await menu.click();await page.getByRole('button',{name:'Экспорт PNG',exact:true}).click();await page.locator('.export-options select').first().selectOption('viewport');const pngDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать PNG',exact:true}).click();const png=await pngDownload;const data=await readFile(await png.path());assert(data.subarray(1,4).equals(Buffer.from('PNG')));assert(data.length>1000);
  // Bounded modal, close control, and no horizontal document overflow.
  await menu.click();const box=await page.locator('#modal').boundingBox(),close=await page.locator('#modal-close').boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=w+1&&box.y+box.height<=h+1);assert(close.y>=0&&close.y+close.height<=h+1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`test-results/${name}-${w}x${h}.png`});await page.locator('#modal-close').click();
  if(w===1440){await menu.click();await page.getByRole('button',{name:'Печать / PDF',exact:true}).click();await page.locator('.export-options select').first().selectOption('viewport');const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'Подготовить страницы'}).click();const popup=await popupPromise;await popup.getByRole('button',{name:'Печать / сохранить как PDF',exact:true}).waitFor();assert(await popup.locator('section img').count()>0);if(name==='chromium')await popup.pdf({path:'test-results/board.pdf',preferCSSPageSize:true,printBackground:true});await popup.close()}
  assert.deepEqual(errors,[],name+' page errors');logs.push(`${name} ${w}x${h}: formula SVG, .axioma roundtrip, PNG, menu bounds passed`);await context.close();
 }}finally{await browser.close()}
}}finally{server.close();await writeFile('test-results/browser-results.txt',logs.join('\n'));console.log(logs.join('\n'))}
