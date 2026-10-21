// Local, rule-based task generation. No network requests or AI service are used.
export const TASK_TOPICS = Object.freeze([
  { id: 'arithmetic', label: 'Действия с числами', grades: [5, 6, 7] },
  { id: 'fractions', label: 'Обыкновенные дроби', grades: [5, 6, 7] },
  { id: 'powers', label: 'Свойства степеней', grades: [7, 8, 9] },
  { id: 'linear', label: 'Линейные уравнения', grades: [6, 7, 8] },
  { id: 'quadratic', label: 'Квадратные уравнения', grades: [8, 9] },
  { id: 'geometry', label: 'Площади, периметры, теорема Пифагора', grades: [5, 6, 7, 8, 9] },
].map(topic => Object.freeze({ ...topic, grades: Object.freeze(topic.grades) })));

const integer = value => String(value).replace('-', '−');
const operand = value => value < 0 ? '(' + integer(value) + ')' : String(value);
const decimal = value => integer(value).replace('.', ',');

function makePicker(random) {
  return (min, max) => {
    const raw = Number(random());
    const unit = Number.isFinite(raw) ? Math.max(0, Math.min(1 - Number.EPSILON, raw)) : 0.5;
    return min + Math.floor(unit * (max - min + 1));
  };
}

function signed(pick, max, min = 1) {
  return pick(min, max) * (pick(0, 1) ? 1 : -1);
}

function fraction(numerator, denominator) {
  if (denominator < 0) { numerator = -numerator; denominator = -denominator; }
  let a = Math.abs(numerator), b = denominator;
  while (b) [a, b] = [b, a % b];
  numerator /= a;
  denominator /= a;
  return denominator === 1 ? integer(numerator) : integer(numerator) + '/' + denominator;
}

function rawFraction(numerator, denominator, grouped = false) {
  const value = integer(numerator) + '/' + denominator;
  return numerator < 0 || grouped ? '(' + value + ')' : value;
}

function arithmetic(level, pick) {
  const operation = pick(0, 3);
  let expression, answer;
  if (level === 'hard') {
    const b = signed(pick, 18), c = signed(pick, 9), d = signed(pick, 25);
    if (operation === 0) {
      const a = signed(pick, 18);
      expression = '(' + integer(a) + ' + ' + operand(b) + ') · ' + operand(c) + ' − ' + operand(d);
      answer = (a + b) * c - d;
    } else if (operation === 1) {
      const quotient = signed(pick, 12), a = b + c * quotient;
      expression = '(' + integer(a) + ' − ' + operand(b) + ') ÷ ' + operand(c) + ' + ' + operand(d);
      answer = quotient + d;
    } else if (operation === 2) {
      const a = signed(pick, 12);
      expression = integer(a) + ' · (' + integer(b) + ' − ' + operand(c) + ') + ' + operand(d);
      answer = a * (b - c) + d;
    } else {
      const a = signed(pick, 15);
      expression = '(' + integer(a) + ' + ' + operand(b) + ') · (' + integer(c) + ' − ' + operand(d) + ')';
      answer = (a + b) * (c - d);
    }
  } else {
    let a = level === 'easy' ? pick(2, 60) : signed(pick, 40);
    let b = level === 'easy' ? pick(2, 40) : signed(pick, 30);
    if (operation === 0) { expression = operand(a) + ' + ' + operand(b); answer = a + b; }
    if (operation === 1) {
      if (level === 'easy') a = b + pick(1, 40);
      expression = operand(a) + ' − ' + operand(b); answer = a - b;
    }
    if (operation === 2) {
      a = level === 'easy' ? pick(2, 12) : signed(pick, 12);
      b = level === 'easy' ? pick(2, 12) : signed(pick, 12);
      expression = operand(a) + ' · ' + operand(b); answer = a * b;
    }
    if (operation === 3) {
      b = level === 'easy' ? pick(2, 12) : signed(pick, 12);
      answer = level === 'easy' ? pick(2, 12) : signed(pick, 12);
      expression = operand(b * answer) + ' ÷ ' + operand(b);
    }
  }
  return { question: 'Вычислите: ' + expression + '.', answer: integer(answer) };
}

function fractions(level, pick) {
  const operation = pick(0, level === 'easy' ? 1 : 3);
  let d1 = pick(2, level === 'hard' ? 24 : 12);
  let d2 = level === 'easy' ? d1 : pick(2, level === 'hard' ? 24 : 15);
  let n1 = level === 'hard' ? signed(pick, 30) : pick(1, d1 - 1);
  let n2 = level === 'hard' ? signed(pick, 30) : pick(1, d2 - 1);
  if (level === 'easy' && operation === 1 && n1 < n2) [n1, n2] = [n2, n1];
  const symbols = ['+', '−', '·', '÷'];
  const numerators = [n1 * d2 + n2 * d1, n1 * d2 - n2 * d1, n1 * n2, n1 * d2];
  const denominator = operation === 3 ? d1 * n2 : d1 * d2;
  return {
    question: 'Вычислите и сократите дробь: ' + rawFraction(n1, d1, operation >= 2) + ' ' + symbols[operation] + ' ' + rawFraction(n2, d2, operation >= 2) + '.',
    answer: fraction(numerators[operation], denominator),
  };
}

const power = (base, exponent) => base + '^' + (exponent < 0 ? '(' + integer(exponent) + ')' : exponent);
const powerAnswer = (base, exponent) => exponent === 0 ? '1' : exponent === 1 ? String(base) : power(base, exponent);

function powers(level, pick) {
  const base = pick(2, level === 'easy' ? 7 : 12);
  const operation = pick(0, level === 'easy' ? 1 : 2);
  let m = level === 'hard' ? pick(-6, 6) : pick(2, 7);
  let n = level === 'hard' ? pick(-6, 6) : pick(1, operation === 2 ? 4 : 6);
  if (level !== 'hard' && operation === 1) m = n + pick(1, 6);
  const expression = operation === 2 ? '(' + power(base, m) + ')^' + (n < 0 ? '(' + integer(n) + ')' : n)
    : power(base, m) + (operation === 0 ? ' · ' : ' ÷ ') + power(base, n);
  const exponent = operation === 0 ? m + n : operation === 1 ? m - n : m * n;
  return { question: 'Упростите: ' + expression + '.', answer: powerAnswer(base, exponent) };
}

function polynomial(terms) {
  let result = '';
  for (const [coefficient, variable] of terms) {
    if (coefficient === 0) continue;
    const absolute = Math.abs(coefficient);
    const term = (absolute === 1 && variable ? '' : absolute) + variable;
    if (!result) result = (coefficient < 0 ? '−' : '') + term;
    else result += (coefficient < 0 ? ' − ' : ' + ') + term;
  }
  return result || '0';
}

function linear(level, pick) {
  const a = level === 'easy' ? pick(2, 9) : signed(pick, level === 'hard' ? 20 : 12);
  const x = level === 'easy' ? pick(1, 12) : pick(level === 'hard' ? -20 : -12, level === 'hard' ? 20 : 12);
  const b = level === 'easy' ? pick(1, 20) : pick(level === 'hard' ? -80 : -30, level === 'hard' ? 80 : 30);
  return {
    question: 'Решите уравнение: ' + polynomial([[a, 'x'], [b, '']]) + ' = ' + integer(a * x + b) + '.',
    answer: 'x = ' + integer(x),
  };
}

function quadratic(level, pick) {
  const first = level === 'easy' ? pick(1, 6) : pick(level === 'hard' ? -12 : -9, level === 'hard' ? 12 : 9);
  const second = level === 'easy' ? pick(first + 1, 12) : pick(level === 'hard' ? -12 : -9, level === 'hard' ? 12 : 9);
  const a = level === 'hard' ? signed(pick, 5, 2) : 1;
  const b = -a * (first + second), c = a * first * second;
  const roots = [first, second].sort((left, right) => left - right);
  return {
    question: 'Решите уравнение: ' + polynomial([[a, 'x²'], [b, 'x'], [c, '']]) + ' = 0.',
    answer: first === second ? 'x = ' + integer(first) : 'x₁ = ' + integer(roots[0]) + '; x₂ = ' + integer(roots[1]),
  };
}

const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]];

function geometry(level, pick) {
  const type = pick(0, level === 'easy' ? 2 : level === 'medium' ? 4 : 5);
  const max = level === 'easy' ? 12 : level === 'medium' ? 20 : 35;
  const a = pick(2, max), b = pick(2, max);
  if (type === 0) {
    return {
      question: level === 'hard'
        ? 'Периметр прямоугольника равен ' + (2 * (a + b)) + ' см, одна из сторон — ' + a + ' см. Найдите его площадь.'
        : 'Стороны прямоугольника равны ' + a + ' см и ' + b + ' см. Найдите его площадь.',
      answer: (a * b) + ' см²',
    };
  }
  if (type === 1) {
    return {
      question: level === 'hard'
        ? 'Площадь прямоугольника равна ' + (a * b) + ' см², одна из сторон — ' + a + ' см. Найдите его периметр.'
        : 'Стороны прямоугольника равны ' + a + ' см и ' + b + ' см. Найдите его периметр.',
      answer: (2 * (a + b)) + ' см',
    };
  }
  if (type === 2 && level !== 'hard') {
    const leg = level === 'easy' ? 2 * a : a;
    return {
      question: 'Катеты прямоугольного треугольника равны ' + leg + ' см и ' + b + ' см. Найдите его площадь.',
      answer: decimal(leg * b / 2) + ' см²',
    };
  }
  if (type === 3) {
    const radius = pick(2, level === 'hard' ? 15 : 10);
    return {
      question: (level === 'hard' ? 'Диаметр круга равен ' + (2 * radius) : 'Радиус круга равен ' + radius) + ' см. Найдите площадь круга. Ответ выразите через π.',
      answer: (radius * radius) + 'π см²',
    };
  }
  const scale = pick(1, level === 'hard' ? 4 : 2);
  const [leg1, leg2, hypotenuse] = TRIPLES[pick(0, TRIPLES.length - 1)].map(side => side * scale);
  if (type === 2) {
    return {
      question: 'Гипотенуза прямоугольного треугольника равна ' + hypotenuse + ' см, один из катетов — ' + leg1 + ' см. Найдите его площадь.',
      answer: decimal(leg1 * leg2 / 2) + ' см²',
    };
  }
  if (type === 5) {
    return {
      question: 'Катеты прямоугольного треугольника равны ' + leg1 + ' см и ' + leg2 + ' см. Найдите его периметр.',
      answer: (leg1 + leg2 + hypotenuse) + ' см',
    };
  }
  return level === 'hard' ? {
    question: 'Гипотенуза прямоугольного треугольника равна ' + hypotenuse + ' см, один из катетов — ' + leg1 + ' см. Найдите второй катет.',
    answer: leg2 + ' см',
  } : {
    question: 'Катеты прямоугольного треугольника равны ' + leg1 + ' см и ' + leg2 + ' см. Найдите гипотенузу.',
    answer: hypotenuse + ' см',
  };
}

const GENERATORS = Object.freeze({ arithmetic, fractions, powers, linear, quadratic, geometry });

/** Generate 1–20 tasks; grade ranges in TASK_TOPICS are navigation hints, not curriculum claims. */
export function generateTasks(options = {}, random = Math.random) {
  const topic = Object.hasOwn(GENERATORS, options?.topic) ? options.topic : 'arithmetic';
  const level = ['easy', 'medium', 'hard'].includes(options?.level) ? options.level : 'medium';
  const requested = Number(options?.count ?? 5);
  const count = Number.isNaN(requested) ? 5 : Math.max(1, Math.min(20, Math.floor(requested)));
  const pick = makePicker(typeof random === 'function' ? random : Math.random);
  // A deterministic fallback prevents a constant RNG from filling a batch with duplicates.
  let seed = 0x6d2b79f5;
  const fallback = makePicker(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  const tasks = [], seen = new Set();
  for (let index = 0; index < count; index++) {
    let task;
    for (let attempt = 0; attempt < 100; attempt++) {
      task = GENERATORS[topic](level, attempt < 20 ? pick : fallback);
      if (!seen.has(task.question)) break;
    }
    seen.add(task.question);
    tasks.push(task);
  }
  return tasks;
}
