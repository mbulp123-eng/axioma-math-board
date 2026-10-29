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
try{for(const [name,engine] of Object.entries({webkit,chromium,firefox})){
 const browser=await engine.launch();try{for(const [w,h] of [[1440,900],[768,1024],[390,844],[844,390],[320,480]]){
  const context=await browser.newContext({viewport:{width:w,height:h},acceptDownloads:true,hasTouch:true});const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
  await page.goto(base);console.log('START',name,w,h);await page.locator('#save-status').filter({hasText:'Сохранено в браузере'}).waitFor();
  const menu=page.getByRole('button',{name:'Меню: доски, файлы, экспорт и инструменты'});await menu.click();
  for(const text of ['Новый урок','Открыть .axioma','Скачать эту доску','Экспорт PNG','Печать / PDF','Справка','Математическая формула'])assert.equal(await page.locator('#modal').getByRole('button',{name:text,exact:true}).count(),1);
  await page.locator('#modal').getByRole('button',{name:'Математическая формула',exact:true}).click();await page.locator('.formula-preview img').waitFor().catch(async e=>{console.log('PREVIEW FAILURE',name,await page.locator('.formula-preview').innerText(),errors);await page.screenshot({path:`test-results/${name}-preview-failure.png`});throw e});
  console.log('FORMULA READY',name,w,h);const latex=String.raw`\begin{cases}\frac{x_1}{2}+\sqrt{x}=3\\x^2=4\end{cases}`;
  await page.getByRole('textbox',{name:'Формула LaTeX'}).fill(latex);await page.waitForFunction(()=>document.querySelector('.formula-preview img')?.alt.includes('cases'));
  await page.locator('#modal').getByRole('button',{name:'Добавить / сохранить'}).click();await page.locator('#modal').waitFor({state:'hidden'});
  // Download/parse real .axioma; round-trip through actual file input.
  await menu.click();const dl=page.waitForEvent('download');await page.locator('#modal').getByRole('button',{name:'Скачать эту доску',exact:true}).click();const file=await dl;const saved=JSON.parse(await readFile(await file.path(),'utf8'));assert(saved.objects.some(o=>o.type==='formula'&&o.latex===latex));
  await page.locator('#project-input').setInputFiles({name:'roundtrip.axioma',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.getByText('Доска открыта как отдельный урок',{exact:true}).waitFor();
  await menu.click();await page.locator('#modal').getByRole('button',{name:'Экспорт PNG',exact:true}).click();await page.locator('.export-options select').first().selectOption('viewport');if((await page.locator('.export-options').innerText()).includes('PNG ограничен')){await page.locator('#modal').getByRole('button',{name:'Скачать PNG',exact:true}).click();assert(await page.locator('#modal').isVisible());await page.locator('.export-options select').first().selectOption('all')}console.log('EXPORT OPTIONS',await page.locator('.export-options').innerText());const pngDownload=page.waitForEvent('download').catch(async e=>{console.log('EXPORT FAILURE',await page.locator('#toast').innerText(),errors);await page.screenshot({path:`test-results/${name}-${w}-export-failure.png`});throw e});await page.locator('#modal').getByRole('button',{name:'Скачать PNG',exact:true}).click();const png=await pngDownload;const data=await readFile(await png.path());assert(data.subarray(1,4).equals(Buffer.from('PNG')));assert(data.length>1000);
  // Bounded modal, close control, and no horizontal document overflow.
  await menu.click();const box=await page.locator('#modal').boundingBox(),close=await page.locator('#modal-close').boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=w+1&&box.y+box.height<=h+1);assert(close.y>=0&&close.y+close.height<=h+1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`test-results/${name}-${w}x${h}-menu.png`});await page.locator('#modal-close').click();await page.screenshot({path:`test-results/${name}-${w}x${h}-board.png`});
  if(w===1440){await menu.click();await page.locator('#modal').getByRole('button',{name:'Печать / PDF',exact:true}).click();await page.locator('.export-options select').first().selectOption('viewport');const popupPromise=page.waitForEvent('popup');await page.locator('#modal').getByRole('button',{name:'Подготовить страницы'}).click();const popup=await popupPromise;await popup.getByRole('button',{name:'Печать / сохранить как PDF',exact:true}).waitFor();assert(await popup.locator('section img').count()>0);if(name==='chromium')await popup.pdf({path:'test-results/board.pdf',preferCSSPageSize:true,printBackground:true});await popup.close()}

  if(w===1440){
   const fixture={format:'axioma',version:1,title:'Экспорт: фон, маркер, фото, формула',grid:'grid',view:{x:100,y:100,scale:1},objects:[
    {type:'marker',x:0,y:0,w:200,h:1,width:20,color:'#167d8d',points:[{x:0,y:0},{x:200,y:0}]},
    {type:'image',x:80,y:70,w:10,h:10,color:'#243b43',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='},
    {type:'formula',x:120,y:50,w:60,h:30,fontSize:32,color:'#243b43',latex:String.raw`\frac{1}{2}`}
   ]};
   await page.locator('#project-input').setInputFiles({name:'fixture.axioma',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.getByText('Доска открыта как отдельный урок',{exact:true}).waitFor();
   await menu.click();await page.locator('#modal').getByRole('button',{name:'Экспорт PNG',exact:true}).click();await page.locator('.export-options select').last().selectOption('1');const waiting=page.waitForEvent('download');await page.locator('#modal').getByRole('button',{name:'Скачать PNG',exact:true}).click();const fixturePNG=await waiting;const bytes=await readFile(await fixturePNG.path());await writeFile(`test-results/${name}-export-fixture.png`,bytes);
   const sampled=await page.evaluate(async src=>{const im=new Image();im.src=src;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const at=(x,y)=>Array.from(ctx.getImageData(x+45,y+45,1,1).data);let ink=0;const d=ctx.getImageData(165,95,60,30).data;for(let i=0;i<d.length;i+=4)if(d[i]<100&&d[i+1]<100&&d[i+2]<100)ink++;return{marker:at(105,5),image:at(85,75),grid:at(0,95),paper:at(5,95),ink}},'data:image/png;base64,'+bytes.toString('base64'));
   assert(sampled.marker[0]>180&&sampled.marker[0]<195,'marker opacity preserved');assert(sampled.image[0]>240&&sampled.image[1]<10&&sampled.image[2]<10,'image pixels preserved');assert(sampled.grid[0]<sampled.paper[0],'background grid preserved');assert(sampled.ink>10,'formula glyphs exported');console.log('RASTER PASS',name,sampled);
  }
  assert.deepEqual(errors,[],name+' page errors');logs.push(`${name} ${w}x${h}: formula SVG, .axioma roundtrip, PNG, menu bounds passed`);await context.close();
 }}finally{await browser.close()}
}}finally{server.close();await writeFile('test-results/browser-results.txt',logs.join('\n'));console.log(logs.join('\n'))}
