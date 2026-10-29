// DOM logic smoke test, not a browser layout test. No requests leave this process.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { AI_ACTIONS, MAX_IMAGE_CHARS, validateAIRequest, resultBlocks } from '../ai-core.js';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const code = fs.readFileSync(new URL('../ai.js', import.meta.url), 'utf8').replace(/^import .*?;\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.boot=initAI;';
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(endpoint) {
  const ids = new Map(), buttons = [];
  let document;
  function el(tag = 'div') {
    const listeners = {}, classes = new Set();
    return { tagName: tag, value: '', textContent: '', dataset: {}, style: {}, children: [], disabled: false, hidden: false, checked: false, offsetWidth: 410, offsetHeight: 40,
      classList: { toggle(c, on) { on ? classes.add(c) : classes.delete(c); } },
      setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; },
      addEventListener(k, fn) { (listeners[k] ??= []).push(fn); },
      async fire(k, extra = {}) { for (const fn of listeners[k] || []) await fn({ target: this, preventDefault() {}, stopPropagation() {}, ...extra }); },
      append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; },
      focus() { document.activeElement = this; }, contains(node) { return this === node || this.children.some(child => child.contains?.(node)); },
      querySelectorAll(selector) { return buttons.filter(b => selector === '[data-ai-mode]' && b.dataset.aiMode); }
    };
  }
  for (const m of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const node = el(m[1]); node.hidden = /\bhidden\b/.test(m[2]); node.checked = /\bchecked\b/.test(m[2]); node.value = m[2].match(/\bvalue="([^"]*)"/)?.[1] || ''; ids.set(m[3], node);
  }
  for (const m of html.matchAll(/<button\b([^>]*)>/g)) {
    const node = ids.get(m[1].match(/\bid="([^"]+)"/)?.[1]) || el('button');
    for (const attr of m[1].matchAll(/data-ai-(mode|open)="([^"]+)"/g)) node.dataset[attr[1] === 'mode' ? 'aiMode' : 'aiOpen'] = attr[2];
    buttons.push(node);
  }
  ids.get('ai-language').value = 'ru'; ids.get('ai-difficulty').value = 'medium';
  const select = s => buttons.filter(b => s === '[data-ai-open]' ? b.dataset.aiOpen : s === '[data-ai-open="custom"]' ? b.dataset.aiOpen === 'custom' : false);
  document = { activeElement: null, getElementById: id => { assert(ids.has(id), `Missing HTML element ${id}`); return ids.get(id); }, createElement: el, querySelectorAll: select, querySelector: s => select(s)[0] };
  const calls = [], inserted = []; let boardId = 'board-a', pending = null, reply = null;const timeouts=[];
  const result = { title: 'Шаг', text: 'Как отменить сложение?', tasks: [], warning: '' };
  const fetch = async (url, options = {}) => {
    if (url.endsWith('/health')) return Response.json({ service: 'axioma-ai', ready: true });
    calls.push(JSON.parse(options.body));
    if (pending) await Promise.race([pending,new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}))]);if(reply)return reply();
    return Response.json({ result });
  };
  const sandbox = { document, URL, AbortController, fetch, TypeError, setTimeout:(fn,ms)=>{if(ms===90000){timeouts.push(fn);return 0}return setTimeout(fn,ms)}, clearTimeout, AI_ENDPOINT: endpoint, AI_ACTIONS, MAX_IMAGE_CHARS, validateAIRequest, resultBlocks, console };
  vm.createContext(sandbox); vm.runInContext(code, sandbox);
  const api = sandbox.boot({ captureSelection: async () => ({ source: 'x + 2 = 5', image: '', count: 1 }), insertBlocks: (blocks, id) => inserted.push({ blocks, id }), id: () => boardId, render() {} });
  return { ids, buttons, calls, inserted, api, result, timeout:()=>timeouts.at(-1)(), reply:fn=>reply=fn, board: id => boardId = id, hold(promise) { pending = promise; } };
}
const offline = setup('');
assert(offline.ids.get('ai-run').disabled); assert(offline.ids.get('ai-connection').textContent.includes('ещё не подключён'));
await offline.buttons.find(b => b.dataset.aiOpen === 'custom').fire('click');
assert(!offline.ids.get('ai-drawer').hidden); assert.equal(offline.ids.get('ai-source').value, 'x + 2 = 5'); assert.equal(offline.calls.length, 0);
await offline.ids.get('ai-form').fire('submit'); assert.equal(offline.calls.length, 0);
const ui = setup('https://axioma-ai.example.workers.dev'); await tick();
await ui.buttons.find(b => b.dataset.aiOpen === 'hint').fire('click');
assert.equal(ui.calls.length, 0, 'Opening the panel must not send selected data');
await ui.ids.get('ai-form').fire('submit'); assert.equal(ui.calls.length, 1);
assert.equal(ui.calls[0].source, 'x + 2 = 5'); assert.equal(ui.calls[0].action, 'hint'); assert.equal(ui.calls[0].previousHints.length, 0);
assert.equal(ui.inserted.length, 0, 'Model output must wait for explicit insertion');
assert(!ui.ids.get('ai-result').hidden);
await ui.ids.get('ai-form').fire('submit'); assert.equal(ui.calls[1].previousHints[0], ui.result.text);
const fields = ui.ids.get('ai-result-fields'); fields.children[1].children[0].value = 'Исправленная подсказка';
await ui.ids.get('ai-insert').fire('click'); assert.equal(ui.inserted[0].blocks[1].text, 'Исправленная подсказка'); assert.equal(ui.inserted[0].id, 'board-a');
let release; ui.hold(new Promise(resolve => release = resolve));
const canceled = ui.ids.get('ai-form').fire('submit'); await tick();
assert(ui.ids.get('ai-fields').disabled); await ui.ids.get('ai-cancel').fire('click'); release(); await canceled;
assert(ui.ids.get('ai-result').hidden, 'Cancelled result must not reappear'); assert(!ui.ids.get('ai-fields').disabled);
ui.hold(new Promise(resolve => release = resolve));
const stale = ui.ids.get('ai-form').fire('submit'); await tick(); ui.board('board-b'); release(); await stale;
assert(ui.ids.get('ai-result').hidden); assert(ui.ids.get('ai-status').textContent.includes('переключили доску'));
console.log('PASS: AI UI unconfigured state, explicit-only submission/insertion, editable preview, hint context, cancellation and stale-board handling (DOM logic, no browser layout or live model).');

const failures=setup('https://axioma-ai.example.workers.dev');await tick();await failures.buttons.find(b=>b.dataset.aiOpen==='hint').fire('click');
assert(failures.ids.get('ai-connection').textContent.includes('ещё не проверен'));
for(const [reply,message] of [
 [()=>Response.json({error:'Бесплатная квота исчерпана'},{status:429}),'квота'],
 [()=>Response.json({result:{title:'x',text:'x',tasks:[null]}}),'неполный'],
 [()=>new Response('not json'),'нечитаемый'],
 [()=>{throw new TypeError('network failure')},'Нет связи']
]){failures.reply(reply);await failures.ids.get('ai-form').fire('submit');assert(failures.ids.get('ai-status').textContent.includes(message));assert(failures.ids.get('ai-result').hidden);assert.equal(failures.inserted.length,0);}
failures.reply(null);failures.hold(new Promise(()=>{}));const timeoutRequest=failures.ids.get('ai-form').fire('submit');await tick();failures.timeout();await timeoutRequest;assert(failures.ids.get('ai-status').textContent.includes('90 секунд'));assert(!failures.ids.get('ai-fields').disabled);assert(failures.ids.get('ai-result').hidden);
console.log('PASS: AI UI timeout, network failure, quota and malformed responses; configured handler is not represented as a verified model (mocked transport).');
