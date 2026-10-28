import { AI_ENDPOINT } from './ai-config.js';
import { AI_ACTIONS, MAX_IMAGE_CHARS, validateAIRequest, resultBlocks } from './ai-core.js';

// Only explicit submissions send data. Drafts and photos stay in memory.
export function initAI(board) {
  const $ = id => document.getElementById(id);
  const panel = $('ai-drawer'), toolbar = $('ai-selection');
  let action = 'custom', photo = '', controller = null, captureVersion = 0, capturing = false;
  let modelAnswered = false;
  let hints = [], hintKey = '', draft = null, resultBoard = null, returnFocus = null;
  let endpoint = '';
  try { const url = new URL(AI_ENDPOINT); if (url.protocol === 'https:' && !url.username && !url.password) endpoint = url.origin; } catch {}
  const modes = [...panel.querySelectorAll('[data-ai-mode]')];
  const status = (text, error = false) => { $('ai-status').textContent = text; $('ai-status').classList.toggle('ai-error', error); };
  function controls() {
    const busy = !!controller || capturing;
    $('ai-fields').disabled = busy;
    modes.forEach(b => b.disabled = busy);
    $('ai-run').disabled = busy || !endpoint;
    $('ai-cancel').hidden = !controller;
    $('ai-run').textContent = controller ? 'ИИ думает…' : action === 'hint' ? (hints.length ? 'Ещё один шаг' : 'Предложить подсказку') : action === 'similar' ? 'Создать задания' : action === 'ocr' ? 'Распознать' : action === 'translate' ? 'Перевести' : 'Отправить запрос';
    panel.setAttribute('aria-busy', String(busy));
  }
  function stop(message = '') {
    controller?.abort(); controller = null; controls();
    if (message) status(message);
  }
  function resetResult() {
    draft = null; resultBoard = null; $('ai-result').hidden = true;
    $('ai-result-fields').replaceChildren(); $('ai-include-answers').checked = false;
  }
  function setPhoto(value) {
    photo = value; $('ai-photo').hidden = !value;
    if (value) $('ai-image').src = value; else $('ai-image').removeAttribute('src');
  }
  function mode(value) {
    if (!Object.hasOwn(AI_ACTIONS, value)) return;
    if (action !== value) { hints = []; hintKey = ''; resetResult(); }
    action = value;
    modes.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.aiMode === action)));
    $('ai-similar-options').hidden = action !== 'similar';
    for (const id of ['ai-count', 'ai-min', 'ai-max']) $(id).disabled = action !== 'similar';
    $('ai-mode-help').textContent = {
      custom: 'Любая математическая тема: укажите класс, цель и нужный формат.',
      similar: 'По образцу задания. Диапазон относится к числам в условии. Проверьте соблюдение ограничений в результате.',
      ocr: 'Выберите фото или рукописную запись. После распознавания исправьте формулу в предпросмотре.',
      hint: 'Один следующий шаг без полного решения. Повторное нажатие учитывает предыдущие подсказки — до шести шагов.',
      check: 'Добавьте условие и ваши шаги решения. Помощник попробует найти первый неверный переход.',
      translate: 'Выберите язык перевода. Для фото сначала используйте распознавание. Формулы лучше записать в $…$ для точного сохранения.'
    }[action];
    controls();
  }
  async function takeSelection() {
    const version = ++captureVersion; stop(); resetResult(); capturing = true; controls();
    hints = []; hintKey = ''; status('Подготавливаю выделенный фрагмент…');
    try {
      const selection = await board.captureSelection();
      if (version !== captureVersion) return;
      $('ai-source').value = selection.source;
      setPhoto(selection.image);
      status(selection.count ? `Взято объектов: ${selection.count}. Проверьте фрагмент перед отправкой.` : 'Можно написать задание, загрузить фото или задать свой вопрос.');
    } catch (error) { if (version === captureVersion) status(error.message || 'Не удалось прочитать выделение.', true); }
    finally { if (version === captureVersion) { capturing = false; controls(); } }
  }
  async function open(value, trigger) {
    returnFocus = trigger; panel.hidden = false; toolbar.hidden = true;
    document.querySelector('[data-ai-open="custom"]').setAttribute('aria-expanded', 'true');
    mode(value); await takeSelection();
    if (!panel.hidden) $(value === 'custom' ? 'ai-prompt' : 'ai-source').focus();
  }
  function close() {
    ++captureVersion; capturing = false; stop(); panel.hidden = true;
    document.querySelector('[data-ai-open="custom"]').setAttribute('aria-expanded', 'false');
    returnFocus?.focus(); board.render();
  }
  document.querySelectorAll('[data-ai-open]').forEach(b => b.addEventListener('click', () => open(b.dataset.aiOpen, b)));
  modes.forEach(b => b.addEventListener('click', () => { stop(); mode(b.dataset.aiMode); status(''); }));
  $('ai-close').addEventListener('click', close);
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  $('ai-cancel').addEventListener('click', () => stop('Ожидание отменено. Уже отправленный запрос может учитываться в квоте.'));
  $('ai-take-selection').addEventListener('click', takeSelection);
  $('ai-remove-photo').addEventListener('click', () => { setPhoto(''); hints = []; hintKey = ''; resetResult(); controls(); });
  $('ai-upload').addEventListener('click', () => $('ai-file').click());
  $('ai-file').addEventListener('change', async e => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    const version = ++captureVersion; stop(); capturing = true; controls(); resetResult();
    try {
      const image = await photoForAI(file);
      if (version !== captureVersion) return;
      setPhoto(image); hints = []; hintKey = ''; status('Фото готово. Перед отправкой проверьте, что формулы читаются.');
    } catch (error) { if (version === captureVersion) status(error.message, true); }
    finally { if (version === captureVersion) { capturing = false; controls(); } }
  });
  $('ai-fields').addEventListener('input', () => {
    hints = []; hintKey = ''; resetResult(); status(''); controls();
  });
  function editable(label, value, max = 10000, rows = 3) {
    const box = document.createElement('label'); box.className = 'ai-edit-label'; box.textContent = label;
    const input = document.createElement('textarea'); input.value = value; input.maxLength = max; input.rows = rows;
    box.append(input); return { box, input };
  }
  function preview(result, boardId) {
    resultBoard = boardId; const fields = $('ai-result-fields'); fields.replaceChildren();
    draft = { title: editable('Заголовок', result.title, 160, 1), text: editable(action === 'ocr' ? 'Распознанный текст' : 'Текст', result.text), tasks: [] };
    fields.append(draft.title.box);
    if (result.text) fields.append(draft.text.box);
    result.tasks.forEach((task, i) => {
      const question = editable(`Задание ${i + 1}`, task.question, 3000);
      const answer = editable('Ответ', task.answer, 1800, 2);
      const details = document.createElement('details'), summary = document.createElement('summary');
      summary.textContent = `Показать ответ к заданию ${i + 1}`; details.append(summary, answer.box);
      fields.append(question.box, details); draft.tasks.push({ question, answer });
    });
    $('ai-warning').textContent = result.warning; $('ai-warning').hidden = !result.warning;
    $('ai-answers-label').hidden = !result.tasks.length;
    $('ai-use-text').hidden = action !== 'ocr';
    $('ai-insert').disabled = false; $('ai-result').hidden = false;
  }
  function editedResult() {
    return { title: draft.title.input.value.trim(), text: draft.text.input.value.trim(), tasks: draft.tasks.map(t => ({ question: t.question.input.value.trim(), answer: t.answer.input.value.trim() })) };
  }
  $('ai-use-text').addEventListener('click', () => {
    if (!draft) return; $('ai-source').value = draft.text.input.value;
    setPhoto(''); resetResult(); hints = []; hintKey = ''; mode('translate');
    status('Исправленный текст принят. Выберите язык и нажмите «Перевести» либо выберите другое действие.');
  });
  $('ai-insert').addEventListener('click', () => {
    if (!draft) return;
    try {
      board.insertBlocks(resultBlocks(editedResult(), $('ai-include-answers').checked), resultBoard);
      $('ai-insert').disabled = true; status('Добавлено на доску. Закройте панель, чтобы продолжить урок.');
    } catch (error) { status(error.message, true); }
  });
  $('ai-result-fields').addEventListener('input', () => { $('ai-insert').disabled = false; });
  $('ai-include-answers').addEventListener('change', () => { $('ai-insert').disabled = false; });
  $('ai-form').addEventListener('submit', async e => {
    e.preventDefault(); if (controller || capturing || !endpoint) return;
    let request;
    try {
      const key = JSON.stringify([action, $('ai-source').value, photo, $('ai-prompt').value, $('ai-language').value]);
      if (hintKey !== key) { hints = []; hintKey = key; }
      if (action === 'hint' && hints.length >= 6) throw new Error('Получены шесть подсказок. Дополните исходное решение своими шагами для продолжения.');
      request = validateAIRequest({ action, source: $('ai-source').value, image: photo, prompt: $('ai-prompt').value, language: $('ai-language').value, previousHints: hints, options: action !== 'similar' ? undefined : { count: Number($('ai-count').value), min: Number($('ai-min').value), max: Number($('ai-max').value), difficulty: $('ai-difficulty').value, integers: $('ai-integers').checked } });
    } catch (error) { status(error.message, true); return; }
    const boardId = board.id(), current = new AbortController(); controller = current;
    resetResult(); controls(); status('Готовлю результат. Это может занять около минуты…');
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; current.abort(); }, 90000);
    try {
      const response = await fetch(endpoint + '/api/assist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: current.signal, credentials: 'omit', cache: 'no-store' });
      const data = await response.json().catch(() => { throw new Error('Сервис вернул нечитаемый ответ. Проверьте подключение ИИ.'); });
      if (!response.ok) throw new Error(data.error || 'Сервис ИИ временно недоступен.');
      if (!data.result || typeof data.result.text !== 'string' || data.result.text.length>16000 || typeof data.result.title !== 'string' || data.result.title.length>160 || !Array.isArray(data.result.tasks) || data.result.tasks.length>20 || data.result.tasks.some(t=>!t||typeof t.question!=='string'||t.question.length>4000||typeof t.answer!=='string'||t.answer.length>4000) || (data.result.warning!==undefined&&typeof data.result.warning!=='string')) throw new Error('Сервис вернул неполный результат. Повторите запрос.');
      if (current !== controller || current.signal.aborted) return;
      if (board.id() !== boardId) throw new Error('Вы переключили доску. Повторите запрос на нужной доске.');
      modelAnswered=true;$('ai-connection').textContent='Получен ответ модели через обработчик. Математическую точность проверяет учитель.';
      preview(data.result, boardId);
      if (action === 'hint') hints.push(data.result.text);
      status(action === 'hint' ? `Подсказка ${hints.length} из 6. Проверьте её перед показом ученику.` : 'Результат готов к проверке. Он ещё не добавлен на доску.');
    } catch (error) {
      if (current === controller) status(timedOut ? 'ИИ не ответил за 90 секунд. Попробуйте позже или сократите запрос.' : error.name === 'AbortError' ? 'Ожидание отменено.' : error instanceof TypeError ? 'Нет связи с ИИ. Проверьте интернет и попробуйте позже.' : error.message, true);
    } finally { clearTimeout(timeout); if (current === controller) { controller = null; controls(); } }
  });
  $('ai-connection').textContent = endpoint ? 'Подключение ИИ проверяется…' : 'ИИ ещё не подключён. Владелец сайта должен завершить настройку Cloudflare. Доска и генератор по шаблонам работают.';
  if (endpoint) {
    const health = new AbortController(), timeout = setTimeout(() => health.abort(), 10000);
    fetch(endpoint + '/health', { signal: health.signal, credentials: 'omit', cache: 'no-store' })
      .then(r => {if(!r.ok)throw Error('Health HTTP '+r.status);return r.json()}).then(data => { if(modelAnswered)return;$('ai-connection').textContent = data.service === 'axioma-ai' && data.ready ? 'Обработчик доступен · ответ модели ещё не проверен' : 'Обработчик требует настройки. Сообщите владельцу сайта.'; })
      .catch(() => { if(modelAnswered)return;$('ai-connection').textContent = 'Не удалось проверить соединение. Можно повторить попытку, отправив запрос.'; })
      .finally(() => clearTimeout(timeout));
  }
  mode('custom');
  return {
    hasFocus: () => !panel.hidden && panel.contains(document.activeElement),
    updateSelection(box, view, size, dragging) {
      const x = box ? box.x * view.scale + view.x : 0, y = box ? box.y * view.scale + view.y : 0;
      toolbar.hidden = !box || !panel.hidden || dragging || x > size.width || y > size.height || (box && (x + box.w * view.scale < 0 || y + box.h * view.scale < 0));
      if (toolbar.hidden) return;
      const w = toolbar.offsetWidth || 410, h = toolbar.offsetHeight || 40;
      toolbar.style.left = Math.max(8, Math.min(Math.max(82, x), size.width - w - 12)) + 'px';
      toolbar.style.top = Math.max(8, Math.min(y - h - 16, size.height - h - 68)) + 'px';
    }
  };
}

export async function photoForAI(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Выберите PNG, JPG или WebP размером до 10 МБ.');
  const url = URL.createObjectURL(file), image = new Image();
  try {
    image.src = url; await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/jpeg', .85);
    if (data.length > MAX_IMAGE_CHARS) data = canvas.toDataURL('image/jpeg', .55);
    if (data.length > MAX_IMAGE_CHARS) throw new Error('Фото слишком большое. Обрежьте его до нужного задания.');
    return data;
  } catch (error) { throw new Error(error.message?.includes('Фото слишком') ? error.message : 'Не удалось прочитать фотографию. Попробуйте другой файл.'); }
  finally { URL.revokeObjectURL(url); }
}
