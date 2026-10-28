// Real-valued, non-executable expression grammar. All angles are radians.
const trig = (fn, pole) => x => Math.abs(pole(x)) < 1e-14 ? NaN : fn(x);
const functions = Object.freeze({
  sin: Math.sin, cos: Math.cos, tan: trig(Math.tan, Math.cos), tg: trig(Math.tan, Math.cos),
  cot: trig(x => 1 / Math.tan(x), Math.sin), ctg: trig(x => 1 / Math.tan(x), Math.sin),
  asin: Math.asin, arcsin: Math.asin, acos: Math.acos, arccos: Math.acos,
  atan: Math.atan, arctan: Math.atan, arctg: Math.atan,
  acot: x => Math.atan2(1, x), arccot: x => Math.atan2(1, x), arcctg: x => Math.atan2(1, x),
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp
});
const constants = Object.freeze({ pi: Math.PI, e: Math.E });
function ratio(n, d = 1n) {
  if (!d || n.toString().length > 200 || d.toString().length > 200) return null;
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n, b = d;
  while (b) [a, b] = [b, a % b];
  return [n / a, d / a];
}
function literal(source) {
  const [decimal, exponent = '0'] = source.toLowerCase().split('e');
  const digits = decimal.replace('.', ''), shift = Number(exponent) - (decimal.split('.')[1]?.length || 0);
  if (Math.abs(shift) > 200) return null;
  return shift >= 0 ? ratio(BigInt(digits) * 10n ** BigInt(shift)) : ratio(BigInt(digits), 10n ** BigInt(-shift));
}
function rationalOperation(a, b, op) {
  if (!a || !b) return null;
  if (op === '+') return ratio(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
  if (op === '-') return ratio(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
  if (op === '*') return ratio(a[0] * b[0], a[1] * b[1]);
  if (op === '/') return ratio(a[0] * b[1], a[1] * b[0]);
  if (op === '^' && b[1] === 1n && b[0] >= -32n && b[0] <= 32n) {
    if (a[0] === 0n && b[0] <= 0n) return null;
    const e = b[0] < 0n ? -b[0] : b[0];
    return b[0] < 0n ? ratio(a[1] ** e, a[0] ** e) : ratio(a[0] ** e, a[1] ** e);
  }
  return null;
}
export function realPower(base, exponent, exactExponent = null) {
  if (!Number.isFinite(base) || !Number.isFinite(exponent) || (base === 0 && exponent <= 0)) return NaN;
  if (base >= 0 || Number.isInteger(exponent)) return Math.pow(base, exponent);
  if (!exactExponent || exactExponent[1] % 2n === 0n) return NaN;
  const [n, d] = exactExponent;
  const magnitude = Math.pow(-base, Number(n) / Number(d));
  return n % 2n ? -magnitude : magnitude;
}
function tokens(input) {
  if (typeof input !== 'string' || input.length > 200) throw new Error('Формула должна содержать не более 200 символов.');
  const text = input.trim().toLowerCase().replace(/^y\s*=\s*/, '').replace(/π/g, 'pi').replace(/х/g, 'x')
    .replace(/×|·/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '.').replace(/²/g, '^2').replace(/³/g, '^3');
  if (!text) throw new Error('Введите функцию, например x^2 или cbrt(x).');
  const result = []; let at = 0;
  while (at < text.length) {
    const rest = text.slice(at), space = /^\s+/.exec(rest), number = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/.exec(rest), name = /^[a-z]+/.exec(rest);
    if (space) { at += space[0].length; continue; }
    if (number) {
      if (!Number.isFinite(Number(number[0]))) throw new Error('Число слишком большое.');
      result.push({ type: 'number', value: Number(number[0]), ratio: literal(number[0]) }); at += number[0].length; continue;
    }
    if (name) {
      if (name[0] !== 'x' && !Object.hasOwn(functions, name[0]) && !Object.hasOwn(constants, name[0])) throw new Error('Неизвестное имя «' + name[0] + '». Доступны x, pi, e, sin, cos, tan, cot, asin, acos, atan, acot, sqrt, cbrt, abs, ln, log, exp. Для корня используйте sqrt(x) или cbrt(x).');
      result.push({ type: 'name', value: name[0] }); at += name[0].length; continue;
    }
    if ('+-*/^()'.includes(text[at])) { result.push({ type: text[at++] }); continue; }
    throw new Error('Не поддерживается символ «' + text[at] + '». В графиках используйте *, /, ^ и круглые скобки; LaTeX вводится в объекте «Формула».');
  }
  result.push({ type: 'end' }); return result;
}
const node = (evaluate, rational = null) => Object.assign(evaluate, { rational });
export function compileExpression(input) {
  const list = tokens(input); let at = 0;
  const peek = () => list[at].type;
  const consume = type => { if (peek() !== type) throw new Error(type === ')' ? 'Не хватает закрывающей скобки.' : 'Проверьте запись формулы.'); return list[at++]; };
  function primary() {
    if (peek() === 'number') { const t = list[at++]; return node(() => t.value, t.ratio); }
    if (peek() === 'name') {
      const name = list[at++].value;
      if (name === 'x') return node(x => x);
      if (Object.hasOwn(constants, name)) return node(() => constants[name]);
      if (peek() !== '(') throw new Error('После ' + name + ' нужны скобки: ' + name + '(x).');
      consume('('); const argument = sum(); consume(')'); return node(x => functions[name](argument(x)));
    }
    if (peek() === '(') { consume('('); const n = sum(); consume(')'); return n; }
    throw new Error('Ожидается число, x или выражение в скобках.');
  }
  function power() {
    const left = primary();
    if (peek() !== '^') return left;
    consume('^'); const right = unary();
    return node(x => realPower(left(x), right(x), right.rational), rationalOperation(left.rational, right.rational, '^'));
  }
  function unary() {
    if (peek() === '+') { consume('+'); return unary(); }
    if (peek() === '-') { consume('-'); const n = unary(); return node(x => -n(x), n.rational ? ratio(-n.rational[0], n.rational[1]) : null); }
    return power();
  }
  function product() {
    let left = unary();
    while (['*', '/', 'number', 'name', '('].includes(peek())) {
      const op = peek() === '/' ? '/' : '*'; if (['*', '/'].includes(peek())) at++;
      const right = unary(), previous = left;
      left = node(op === '/' ? x => previous(x) / right(x) : x => previous(x) * right(x), rationalOperation(previous.rational, right.rational, op));
    }
    return left;
  }
  function sum() {
    let left = product();
    while (['+', '-'].includes(peek())) {
      const op = list[at++].type, right = product(), previous = left;
      left = node(op === '+' ? x => previous(x) + right(x) : x => previous(x) - right(x), rationalOperation(previous.rational, right.rational, op));
    }
    return left;
  }
  const expression = sum(); if (peek() !== 'end') throw new Error('Лишняя скобка или незавершённая формула.');
  return x => { if (!Number.isFinite(x)) return NaN; const value = expression(x); return Number.isFinite(value) ? value : NaN; };
}
