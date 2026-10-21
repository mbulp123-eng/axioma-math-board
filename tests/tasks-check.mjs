import assert from 'node:assert/strict';
import { TASK_TOPICS, generateTasks } from '../tasks.js';
import { compileExpression } from '../math.js';

const evaluate = (expression, x = 0) => compileExpression(expression.replaceAll('²', '^2'))(x);
const close = (actual, expected, message) => assert(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), message);
const gcd = (a, b) => b ? gcd(b, a % b) : a;
function randomFrom(seed) {
  return () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

assert.deepEqual(generateTasks({ topic: 'arithmetic', level: 'easy', count: 1 }, () => 0), [
  { question: 'Вычислите: 2 + 2.', answer: '4' },
]);
assert.deepEqual(generateTasks({ topic: 'fractions', level: 'easy', count: 1 }, () => 0), [
  { question: 'Вычислите и сократите дробь: 1/2 + 1/2.', answer: '1' },
]);
assert.deepEqual(generateTasks({ topic: 'linear', level: 'easy', count: 1 }, () => 0), [
  { question: 'Решите уравнение: 2x + 1 = 3.', answer: 'x = 1' },
]);
assert.deepEqual(generateTasks({ topic: 'quadratic', level: 'easy', count: 1 }, () => 0), [
  { question: 'Решите уравнение: x² − 3x + 2 = 0.', answer: 'x₁ = 1; x₂ = 2' },
]);

for (const [count, expected] of [[0, 1], [-5, 1], [3.9, 3], [25, 20], [Infinity, 20], [-Infinity, 1], [NaN, 5], ['8', 8]]) {
  assert.equal(generateTasks({ count }, randomFrom(23)).length, expected);
}
assert.equal(generateTasks(null, randomFrom(8)).length, 5);
assert.deepEqual(generateTasks({ topic: '__proto__', level: 'unknown', count: 3 }, randomFrom(4)),
  generateTasks({ topic: 'arithmetic', level: 'medium', count: 3 }, randomFrom(4)));
assert.deepEqual(generateTasks({ topic: 'geometry', level: 'hard', count: 20 }, randomFrom(713)),
  generateTasks({ topic: 'geometry', level: 'hard', count: 20 }, randomFrom(713)), 'A seeded RNG must reproduce a batch.');

function checkGeometry({ question, answer }) {
  const values = [...question.matchAll(/\d+/g)].map(match => Number(match[0]));
  let expected, expectedUnit;
  if (question.startsWith('Стороны прямоугольника')) {
    expected = question.includes('площадь') ? values[0] * values[1] : 2 * (values[0] + values[1]);
    expectedUnit = question.includes('площадь') ? 'см²' : 'см';
  } else if (question.startsWith('Периметр прямоугольника')) {
    expected = values[1] * (values[0] / 2 - values[1]); expectedUnit = 'см²';
  } else if (question.startsWith('Площадь прямоугольника')) {
    expected = 2 * (values[1] + values[0] / values[1]); expectedUnit = 'см';
  } else if (question.startsWith('Радиус круга') || question.startsWith('Диаметр круга')) {
    const radius = question.startsWith('Диаметр') ? values[0] / 2 : values[0];
    assert.equal(answer, radius ** 2 + 'π см²'); return;
  } else if (question.startsWith('Катеты прямоугольного треугольника')) {
    const [a, b] = values, c = Math.hypot(a, b);
    expected = question.includes('площадь') ? a * b / 2 : question.includes('периметр') ? a + b + c : c;
    expectedUnit = question.includes('площадь') ? 'см²' : 'см';
  } else if (question.startsWith('Гипотенуза прямоугольного треугольника')) {
    const [c, a] = values, b = Math.sqrt(c * c - a * a);
    assert(b > 0, 'The hypotenuse must exceed a leg.');
    expected = question.includes('площадь') ? a * b / 2 : b;
    expectedUnit = question.includes('площадь') ? 'см²' : 'см';
  } else assert.fail('Unrecognized geometry problem: ' + question);
  const [number, unit] = answer.split(' ');
  close(Number(number.replace(',', '.')), expected, question + ' / ' + answer);
  assert.equal(unit, expectedUnit);
}

let checked = 0;
const operations = new Set();
for (const { id, label, grades } of TASK_TOPICS) {
  assert(label.length > 0 && grades.every(grade => Number.isInteger(grade) && grade >= 1 && grade <= 11));
  for (const level of ['easy', 'medium', 'hard']) {
    // Even pathological RNG values must produce bounded, useful, distinct tasks.
    for (const value of [0, 0.5, 1, -1, Infinity, NaN]) {
      const tasks = generateTasks({ topic: id, level, count: 20 }, () => value);
      assert.equal(tasks.length, 20);
      assert.equal(new Set(tasks.map(task => task.question)).size, 20, id + '/' + level + ' repeated questions');
      assert(tasks.every(task => !/NaN|Infinity|undefined/.test(task.question + task.answer)));
    }
    for (let batch = 1; batch <= 10; batch++) {
      const tasks = generateTasks({ topic: id, level, count: 20 }, randomFrom(batch * 8317));
      assert.equal(new Set(tasks.map(task => task.question)).size, tasks.length);
      for (const task of tasks) {
        const { question, answer } = task;
        assert.deepEqual(Object.keys(task).sort(), ['answer', 'question']);
        if (['arithmetic', 'fractions', 'powers'].includes(id)) {
          const expression = question.slice(question.indexOf(':') + 1, -1).trim();
          close(evaluate(answer), evaluate(expression), question + ' / ' + answer);
          if (id === 'fractions' && answer.includes('/')) {
            const [n, d] = answer.replace('−', '-').split('/').map(Number);
            assert(d > 1 && gcd(Math.abs(n), d) === 1, 'Fraction answer must be reduced.');
          }
          for (const symbol of ['+', '−', '·', '÷']) if (expression.includes(symbol)) operations.add(id + symbol);
        } else if (id === 'linear' || id === 'quadratic') {
          const equation = question.slice(question.indexOf(':') + 1, -1).trim();
          const [left, right] = equation.split('=');
          const roots = [...answer.matchAll(/= ([−\d]+)/g)].map(match => Number(match[1].replace('−', '-')));
          assert(roots.length > 0 && roots.every(Number.isInteger));
          for (const root of roots) close(evaluate(left, root), evaluate(right, root), question + ' / ' + answer);
          const constant = evaluate(left, 0) - evaluate(right, 0);
          if (id === 'linear') {
            const coefficient = evaluate(left, 1) - evaluate(right, 1) - constant;
            assert.notEqual(coefficient, 0); assert.equal(roots.length, 1);
            close(roots[0], -constant / coefficient, question);
          } else {
            const f1 = evaluate(left, 1), fMinus1 = evaluate(left, -1);
            const a = (f1 + fMinus1 - 2 * constant) / 2;
            const b = (f1 - fMinus1) / 2;
            const discriminant = b * b - 4 * a * constant;
            assert.notEqual(a, 0); assert(discriminant >= 0);
            assert.equal(roots.length, discriminant === 0 ? 1 : 2);
          }
        } else checkGeometry(task);
        checked++;
      }
    }
  }
}
for (const topic of ['arithmetic', 'fractions']) {
  for (const symbol of ['+', '−', '·', '÷']) assert(operations.has(topic + symbol), topic + ' missing ' + symbol);
}
console.log('PASS: ' + checked + ' mathematical answers, reduced fractions, complete equation roots, geometry units, all levels, bounds and duplicate handling.');
