/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as math from 'mathjs';
import { FunctionAnalysis, XPoint, YPrimeRow, YRow, YPointValue, ExplanationStep } from '../types';

// Helper: GCD for fraction simplification
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// Convert a numerical value into an elegant LaTeX representation
export function toExactLatex(val: number): string {
  if (Math.abs(val) < 1e-9) return "0";
  
  // Try integer
  const rounded = Math.round(val);
  if (Math.abs(val - rounded) < 1e-5) {
    return rounded.toString();
  }
  
  // Try simple fractions with denominators up to 100
  const signStr = val < 0 ? "-" : "";
  const absVal = Math.abs(val);
  for (let denom = 2; denom <= 100; denom++) {
    const numer = Math.round(absVal * denom);
    if (Math.abs(absVal - numer / denom) < 1e-5) {
      const g = gcd(numer, denom);
      const n = numer / g;
      const d = denom / g;
      if (d === 1) return `${signStr}${n}`;
      return `${signStr}\\frac{${n}}{${d}}`;
    }
  }

  // Try square roots (e.g. a * sqrt(b) / c)
  const val2 = val * val;
  for (let denom = 1; denom <= 36; denom++) {
    const numer = Math.round(val2 * denom);
    if (Math.abs(val2 - numer / denom) < 1e-4) {
      if (denom === 1) {
        return `${val < 0 ? '-' : ''}\\sqrt{${numer}}`;
      } else {
        const sn = Math.sqrt(numer);
        const sd = Math.sqrt(denom);
        const sn_r = Math.round(sn);
        const sd_r = Math.round(sd);
        if (Math.abs(sn - sn_r) < 1e-5 && Math.abs(sd - sd_r) < 1e-5) {
          const g = gcd(sn_r, sd_r);
          const n = sn_r / g;
          const d = sd_r / g;
          if (d === 1) return `${val < 0 ? '-' : ''}${n}`;
          return `${val < 0 ? '-' : ''}\\frac{${n}}{${d}}`;
        }
        
        // e.g. sqrt(numer) / sd_r
        if (Math.abs(sd - sd_r) < 1e-5) {
          return `${val < 0 ? '-' : ''}\\frac{\\sqrt{${numer}}}{${sd_r}}`;
        }
      }
    }
  }
  
  // Fallback to 2 decimal places
  return val.toFixed(2).replace(/\.00$/, '');
}

// Convert an exact LaTeX back to an exact numerical value if possible
export function parseLatexToVal(latex: string): number | null {
  if (!latex) return null;
  // If it's a simple integer, e.g. "-1", "2"
  if (/^-?\d+$/.test(latex)) {
    return parseInt(latex, 10);
  }
  // If it's a simple fraction, e.g. "\frac{1}{2}", "-\frac{3}{4}"
  const fracMatch = latex.match(/^(-)?\\frac\{(\d+)\}\{(\d+)\}$/);
  if (fracMatch) {
    const isNeg = !!fracMatch[1];
    const num = parseInt(fracMatch[2], 10);
    const den = parseInt(fracMatch[3], 10);
    return (isNeg ? -1 : 1) * (num / den);
  }
  // If it's a simple square root, e.g. "\sqrt{2}" or "-\sqrt{3}"
  const sqrtMatch = latex.match(/^(-)?\\sqrt\{(\d+)\}$/);
  if (sqrtMatch) {
    const isNeg = !!sqrtMatch[1];
    const radicand = parseInt(sqrtMatch[2], 10);
    return (isNeg ? -1 : 1) * Math.sqrt(radicand);
  }
  // If it's a fraction of square root, e.g. "\frac{\sqrt{2}}{2}"
  const sqrtFracMatch = latex.match(/^(-)?\\frac\{\\sqrt\{(\d+)\}\}\{(\d+)\}$/);
  if (sqrtFracMatch) {
    const isNeg = !!sqrtFracMatch[1];
    const radicand = parseInt(sqrtFracMatch[2], 10);
    const den = parseInt(sqrtFracMatch[3], 10);
    return (isNeg ? -1 : 1) * (Math.sqrt(radicand) / den);
  }
  return null;
}

// Automatically expand implicit algebraic multiplication, e.g. 2x -> 2*x, x(x-1) -> x*(x-1), ab -> a*b, etc.
export function preprocessImplicitMultiplication(expr: string): string {
  if (!expr) return expr;
  
  let current = expr;
  
  // Replace dividing sign if any
  current = current.replace(/÷/g, '/');
  
  // Step A: Digit followed by letter, parenthesis or backslash (like \sqrt)
  // E.g. 2x -> 2*x, 3.5x -> 3.5*x, 2( -> 2*(, 2sqrt -> 2*sqrt
  current = current.replace(/([0-9])\s*([a-zA-Z\(\\])/g, '$1*$2');
  
  // Step B: Closing parenthesis followed by opening parenthesis
  // E.g. (x+1)(x+2) -> (x+1)*(x+2)
  current = current.replace(/\)\s*\(/g, ')*(');
  
  // Step C: Closing parenthesis followed by letter or backslash
  // E.g. (x+1)x -> (x+1)*x, (x+1)sin -> (x+1)*sin, (x+1)\sqrt -> (x+1)*\sqrt
  current = current.replace(/\)\s*([a-zA-Z\\])/g, ')*$1');
  
  // Step D: Variable 'x' or 'e' followed by parenthesis
  // E.g. x(x+1) -> x*(x+1), e(x) -> e*(x)
  current = current.replace(/\b(x|e)\s*\(/gi, '$1*(');
  
  // Step E: Letter 'x' followed by another word (math function or constant) with space(s) in between
  // E.g. "x sin" -> "x*sin", "x ln" -> "x*ln", "x e" -> "x*e"
  current = current.replace(/\b(x)\s+([a-zA-Z])/gi, '$1*$2');
  
  // Step F: Letter 'x' followed directly by a standard math function (without spaces)
  // E.g. xln(x) -> x*ln(x), xsin(x) -> x*sin(x)
  current = current.replace(/\b(x)(ln|lg|log|sin|cos|tan|cot|sqrt|exp)\b/gi, '$1*$2');
  
  // Step G: Single algebraic parameter letters (like a, b, c, d, m, k, n) followed by variable 'x' or open parenthesis '('
  // E.g. ax -> a*x, mx -> m*x, a(x+1) -> a*(x+1)
  current = current.replace(/\b([a-df-wyz])\s*x\b/gi, '$1*x');
  current = current.replace(/\b([a-df-wyz])\s*\(/gi, '$1*(');

  return current;
}

// Helper: Beautifully format a polynomial with exact coefficients
export function formatPolyLatex(coeffs: number[], powers: number[]): string {
  let latex = '';
  coeffs.forEach((c, idx) => {
    const power = powers[idx];
    if (Math.abs(c) < 1e-6) return;
    
    // sign
    const sign = c < 0 ? '-' : (latex === '' ? '' : '+');
    const absC = Math.abs(c);
    
    // coefficient string
    let coeffStr = '';
    if (power === 0) {
      coeffStr = toExactLatex(absC);
    } else {
      coeffStr = Math.abs(absC - 1) < 1e-6 ? '' : toExactLatex(absC);
    }
    
    // variable string
    let varStr = '';
    if (power > 0) {
      varStr = power === 1 ? 'x' : `x^{${power}}`;
    }
    
    latex += `${sign}${coeffStr}${varStr}`;
  });
  return latex || '0';
}

// Function Classification definition
export interface FunctionClassification {
  type: 'constant' | 'linear' | 'quadratic' | 'cubic' | 'quartic' | 'rational_generic' | 'exponential' | 'logarithmic' | 'trigonometric' | 'other';
  coeffs: number[];
  numNode?: math.MathNode;
  denNode?: math.MathNode;
}

// Check if a node represents a polynomial expression
function isPolynomialNode(n: math.MathNode): boolean {
  let valid = true;
  try {
    n.traverse((child) => {
      if (child.type === 'FunctionNode') {
        valid = false;
      }
      if (child.type === 'OperatorNode') {
        const op = (child as any).op;
        if (!['+', '-', '*', '/', '^'].includes(op)) {
          valid = false;
        }
        if (op === '/') {
          valid = false;
        }
        if (op === '^') {
          const exponent = (child as any).args[1];
          if (exponent.type !== 'ConstantNode' || !Number.isInteger(exponent.value) || exponent.value < 0) {
            valid = false;
          }
        }
      }
    });
  } catch {
    valid = false;
  }
  return valid;
}

// 1. Function classification engine
export function classifyFunction(node: math.MathNode): FunctionClassification {
  let hasTrig = false;
  let hasLog = false;
  let hasExp = false;
  
  node.traverse((child) => {
    if (child.type === 'FunctionNode') {
      const name = (child as any).name;
      if (['sin', 'cos', 'tan', 'cot'].includes(name)) {
        hasTrig = true;
      }
      if (['ln', 'log', 'log10'].includes(name)) {
        hasLog = true;
      }
      if (name === 'exp') {
        hasExp = true;
      }
    }
    if (child.type === 'OperatorNode' && (child as any).op === '^') {
      const exponent = (child as any).args[1];
      const variables: string[] = [];
      exponent.traverse((expChild) => {
        if (expChild.type === 'SymbolNode' && (expChild as any).name === 'x') {
          variables.push('x');
        }
      });
      if (variables.length > 0) {
        hasExp = true;
      }
    }
  });

  const isPureTrig = (n: math.MathNode): boolean => {
    if (n.type === 'FunctionNode') {
      const name = (n as any).name;
      if (['sin', 'cos'].includes(name)) {
        const arg = (n as any).args[0];
        return arg && arg.type === 'SymbolNode' && (arg as any).name === 'x';
      }
    }
    if (n.type === 'OperatorNode' && (n as any).op === '-' && (n as any).args.length === 1) {
      return isPureTrig((n as any).args[0]);
    }
    return false;
  };

  if (hasTrig && isPureTrig(node)) return { type: 'trigonometric', coeffs: [] };
  if (hasLog) return { type: 'logarithmic', coeffs: [] };
  if (hasExp) return { type: 'exponential', coeffs: [] };

  // Rational fraction simplification checking via math.rationalize
  let rationalized: math.MathNode;
  try {
    rationalized = math.rationalize(node);
  } catch {
    rationalized = node;
  }

  if (rationalized.type === 'OperatorNode' && (rationalized as any).op === '/') {
    const numNode = (rationalized as any).args[0];
    const denNode = (rationalized as any).args[1];
    if (isPolynomialNode(numNode) && isPolynomialNode(denNode)) {
      const denStr = denNode.toString();
      if (denStr.includes('x')) {
        return { type: 'rational_generic', coeffs: [], numNode, denNode };
      }
    }
  }

  // Check if it is a polynomial: y = ax^4 + bx^3 + cx^2 + dx + e
  try {
    const comp = node.compile();
    const Y = [
      comp.evaluate({ x: -2 }),
      comp.evaluate({ x: -1 }),
      comp.evaluate({ x: 0 }),
      comp.evaluate({ x: 1 }),
      comp.evaluate({ x: 2 })
    ];
    
    const e = Y[2];
    const a = (Y[4] + Y[0] - 4 * (Y[3] + Y[1]) + 6 * e) / 24;
    const b = (Y[4] - Y[0] - 2 * (Y[3] - Y[1])) / 12;
    const c = (Y[3] + Y[1] - 2 * e) / 2 - a;
    const d = (Y[3] - Y[1]) / 2 - b;
    
    const polyValid = Math.abs((a * 81 + b * 27 + c * 9 + d * 3 + e) - comp.evaluate({ x: 3 })) < 1e-4;
    
    if (polyValid) {
      if (Math.abs(a) > 1e-5) {
        if (Math.abs(b) < 1e-4 && Math.abs(d) < 1e-4) {
          return { type: 'quartic', coeffs: [a, c, e] }; // ax^4 + cx^2 + e
        }
      } else if (Math.abs(b) > 1e-5) {
        return { type: 'cubic', coeffs: [b, c, d, e] };
      } else if (Math.abs(c) > 1e-5) {
        return { type: 'quadratic', coeffs: [c, d, e] };
      } else if (Math.abs(d) > 1e-5) {
        return { type: 'linear', coeffs: [d, e] };
      }
      return { type: 'constant', coeffs: [e] };
    }
  } catch {
    // ignore
  }

  return { type: 'other', coeffs: [] };
}

// Unified, general rational function solver for any polynomial degrees
export function solveRationalGeneric(
  numNode: math.MathNode,
  denNode: math.MathNode,
  functionStr: string,
  functionLatex: string
): FunctionAnalysis | null {
  const P = numNode.compile();
  const Q = denNode.compile();
  
  const evalP = (x: number) => {
    try {
      const val = P.evaluate({ x });
      return (typeof val === 'number' && !isNaN(val)) ? val : NaN;
    } catch {
      return NaN;
    }
  };

  const evalQ = (x: number) => {
    try {
      const val = Q.evaluate({ x });
      return (typeof val === 'number' && !isNaN(val)) ? val : NaN;
    } catch {
      return NaN;
    }
  };

  const evalY = (x: number) => {
    const q = evalQ(x);
    if (Math.abs(q) < 1e-9 || isNaN(q)) return NaN;
    const p = evalP(x);
    return p / q;
  };

  // Find poles (roots of Q(x) = 0)
  const poles = findRoots(denNode);

  // Symbolic Derivative
  const dy = math.derivative(math.parse(`(${numNode.toString()}) / (${denNode.toString()})`), 'x');
  const dySimplified = math.simplify(dy);
  const derivLatex = dySimplified.toTex();
  const dyEval = dySimplified.compile();

  const dR = (x: number) => {
    try {
      const val = dyEval.evaluate({ x });
      return (typeof val === 'number' && !isNaN(val)) ? val : NaN;
    } catch {
      return NaN;
    }
  };

  // Find raw critical points
  const rawCriticals = findRoots(dySimplified);
  
  // Filter critical points: must not be poles and must change sign
  const filteredCriticals = rawCriticals
    .filter(c => !poles.some(p => Math.abs(p - c) < 1e-3))
    .filter(c => {
      const dLeft = dR(c - 1e-4);
      const dRight = dR(c + 1e-4);
      return dLeft * dRight < -1e-10;
    })
    .sort((a, b) => a - b);

  // Construct X-Row Points
  const x_points: XPoint[] = [];
  x_points.push({ id: 'x-0', latex: '-\\infty', type: 'infinity', value: -Infinity });
  
  let pointCounter = 1;
  const sortedMilestones = [
    ...poles.map(p => ({ val: p, type: 'discontinuity' as const })),
    ...filteredCriticals.map(c => ({ val: c, type: 'critical' as const }))
  ].sort((a, b) => a.val - b.val);

  sortedMilestones.forEach(m => {
    const exactLatex = toExactLatex(m.val);
    const parsedVal = parseLatexToVal(exactLatex);
    x_points.push({
      id: `x-${pointCounter++}`,
      latex: exactLatex,
      type: m.type,
      value: parsedVal !== null ? parsedVal : m.val
    });
  });
  x_points.push({ id: `x-${pointCounter}`, latex: '+\\infty', type: 'infinity', value: Infinity });
  const N = x_points.length;

  // Compute Y' signs
  const y_prime_points: ('0' | 'd' | '')[] = [];
  const y_prime_intervals: ('+' | '-' | 'h')[] = [];

  x_points.forEach((p) => {
    if (p.type === 'infinity') {
      y_prime_points.push('');
    } else if (p.type === 'discontinuity') {
      y_prime_points.push('d');
    } else {
      y_prime_points.push('0');
    }
  });

  for (let i = 0; i < N - 1; i++) {
    const left = x_points[i].value!;
    const right = x_points[i + 1].value!;
    const xMid = left === -Infinity && right === Infinity ? 0
      : left === -Infinity ? right - 1.5
      : right === Infinity ? left + 1.5
      : (left + right) / 2;
    
    const dVal = dR(xMid);
    if (isNaN(dVal)) {
      y_prime_intervals.push('h');
    } else {
      y_prime_intervals.push(dVal > 1e-7 ? '+' : (dVal < -1e-7 ? '-' : '+'));
    }
  }

  // Compute Y values
  const y_points_vals: YPointValue[] = [];
  x_points.forEach((p, idx) => {
    if (p.type === 'infinity') {
      const testVal = p.value === -Infinity ? -1e5 : 1e5;
      const limitVal = evalY(testVal);
      
      if (!isNaN(limitVal) && isFinite(limitVal) && Math.abs(limitVal) < 1e3) {
        // Finite limit (horizontal asymptote)
        const limitLatex = toExactLatex(limitVal);
        let position: 'top' | 'middle' | 'bottom' = 'middle';
        if (idx === 0) {
          position = y_prime_intervals[0] === '+' ? 'bottom' : 'top';
        } else {
          position = y_prime_intervals[y_prime_intervals.length - 1] === '+' ? 'top' : 'bottom';
        }
        y_points_vals.push({ type: 'single', latex: limitLatex, position });
      } else {
        // Infinite limit
        const limitLatex = limitVal > 0 ? '+\\infty' : '-\\infty';
        const position = limitVal > 0 ? 'top' : 'bottom';
        y_points_vals.push({ type: 'single', latex: limitLatex, position });
      }
    } else if (p.type === 'discontinuity') {
      const poleVal = p.value!;
      const leftY = evalY(poleVal - 1e-5);
      const rightY = evalY(poleVal + 1e-5);
      
      const latexLeft = (leftY > 1e3 || isNaN(leftY)) ? '+\\infty' : ((leftY < -1e3) ? '-\\infty' : toExactLatex(leftY));
      const latexRight = (rightY > 1e3 || isNaN(rightY)) ? '+\\infty' : ((rightY < -1e3) ? '-\\infty' : toExactLatex(rightY));
      
      const positionLeft = latexLeft.includes('-\\infty') ? 'bottom' : (latexLeft.includes('+\\infty') ? 'top' : 'middle');
      const positionRight = latexRight.includes('-\\infty') ? 'bottom' : (latexRight.includes('+\\infty') ? 'top' : 'middle');
      
      y_points_vals.push({ type: 'discontinuity', latexLeft, positionLeft, latexRight, positionRight });
    } else {
      const critVal = p.value!;
      const val = evalY(critVal);
      const leftSign = y_prime_intervals[idx - 1];
      const rightSign = y_prime_intervals[idx];
      let position: 'top' | 'middle' | 'bottom' = 'middle';
      if (leftSign === '+' && rightSign === '-') {
        position = 'top';
      } else if (leftSign === '-' && rightSign === '+') {
        position = 'bottom';
      }
      y_points_vals.push({ type: 'single', latex: toExactLatex(val), position });
    }
  });

  const y_row: YRow = { points: y_points_vals };

  // tkz-tab code
  const espcl = Math.max(1.5, parseFloat((8.0 / (N - 1)).toFixed(1)));
  const xList = x_points.map(p => `$${p.latex}$`).join(', ');
  
  const yPrimeLineParts: string[] = [];
  for (let i = 0; i < N; i++) {
    if (i === 0) {
      yPrimeLineParts.push('');
    } else {
      yPrimeLineParts.push(y_prime_intervals[i - 1]);
    }
    if (x_points[i].type === 'discontinuity') {
      yPrimeLineParts.push('d');
    } else if (x_points[i].type === 'critical') {
      yPrimeLineParts.push('z');
    } else if (i > 0 && i < N - 1) {
      yPrimeLineParts.push('');
    }
  }
  yPrimeLineParts.push('');
  const yPrimeLine = yPrimeLineParts.join(', ');

  const yVarParts: string[] = [];
  y_points_vals.forEach((yv, i) => {
    if (yv.type === 'single') {
      const sign = yv.position === 'top' ? '+' : '-';
      yVarParts.push(`${sign}/ $${yv.latex}$`);
    } else {
      const leftSign = yv.positionLeft === 'top' ? '+' : '-';
      const rightSign = yv.positionRight === 'top' ? '+' : '-';
      yVarParts.push(`${leftSign}D${rightSign}/ $${yv.latexLeft}$ / $${yv.latexRight}$`);
    }
  });
  const yVarLine = yVarParts.join(', ');

  const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=${espcl}]
  {$x$ / 1, $y'$ / 1, $y$ / 2.5}
  {${xList}}
\\tkzTabLine{${yPrimeLine}}
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;

  // Explanation steps
  const explanation_steps: ExplanationStep[] = [];

  // Step 1: TXD
  let txdLatex = 'D = \\mathbb{R}';
  let txdContent = 'Tập xác định của hàm số: $D = \\mathbb{R}$.';
  if (poles.length > 0) {
    const poleLatexList = poles.map(p => toExactLatex(p)).join('; ');
    txdLatex = `D = \\mathbb{R} \\setminus \\{${poleLatexList}\\}`;
    txdContent = `Tập xác định của hàm số: $D = \\mathbb{R} \\setminus \\{${poleLatexList}\\}$.`;
  }
  explanation_steps.push({ title: 'Bước 1. Tập xác định', content: txdContent });

  // Step 2: Đạo hàm
  let derivativeExplanation = `Ta có đạo hàm $y' = ${derivLatex}$.\n`;
  if (filteredCriticals.length > 0) {
    const rootEqs = filteredCriticals.map(c => `x = ${toExactLatex(c)}`).join(' hoặc ');
    derivativeExplanation += `Cho $y' = 0 \\Leftrightarrow x = ${rootEqs}$.`;
  } else {
    derivativeExplanation += `Ta thấy phương trình $y' = 0$ vô nghiệm trên tập xác định. Đạo hàm $y'$ không đổi dấu.`;
  }
  explanation_steps.push({ title: "Bước 2: Tính đạo hàm y' và tìm các điểm tới hạn", content: derivativeExplanation });

  // Step 3: Giới hạn và tiệm cận
  let limitExplanation = `Tính giới hạn tại các điểm gián đoạn và vô cực:\n`;
  if (poles.length > 0) {
    limitExplanation += `* Tiệm cận đứng: `;
    poles.forEach(p => {
      const pL = toExactLatex(p);
      limitExplanation += `$x = ${pL}$ là đường tiệm cận đứng vì $\\lim_{x \\to ${pL}^\\pm} y = \\pm\\infty$.\n`;
    });
  }
  
  // Horizontal/Slant asymptotes check
  const limPos = evalY(1e5);
  const limNeg = evalY(-1e5);
  if (!isNaN(limPos) && isFinite(limPos) && Math.abs(limPos) < 1e3 && Math.abs(limPos - limNeg) < 1e-2) {
    const haL = toExactLatex(limPos);
    limitExplanation += `* Tiệm cận ngang: $y = ${haL}$ vì $\\lim_{x \\to \\pm\\infty} y = ${haL}$.\n`;
  } else {
    const aVal = evalY(1e5) / 1e5;
    if (!isNaN(aVal) && isFinite(aVal) && Math.abs(aVal) > 1e-4) {
      const bVal = evalY(1e5) - aVal * 1e5;
      if (!isNaN(bVal) && isFinite(bVal)) {
        const slantL = formatPolyLatex([aVal, bVal], [1, 0]);
        limitExplanation += `* Tiệm cận xiên: $y = ${slantL}$ vì $\\lim_{x \\to \\pm\\infty} [y - (${slantL})] = 0$.\n`;
      }
    }
  }
  explanation_steps.push({ title: 'Bước 3: Tính các giá trị cực trị, giới hạn, tiệm cận', content: limitExplanation.trim() });

  // Step 4: BBT & Kết luận
  let bbtExplanation = `Dựa vào bảng biến thiên, ta kết luận các tính chất của hàm số:\n`;
  y_prime_intervals.forEach((sign, i) => {
    const leftX = x_points[i].latex;
    const rightX = x_points[i + 1].latex;
    bbtExplanation += `* Hàm số **${sign === '+' ? 'đồng biến' : 'nghịch biến'}** trên khoảng $(${leftX}; ${rightX})$.\n`;
  });
  
  const cMax = y_points_vals.filter(yv => yv.type === 'single' && yv.position === 'top');
  const cMin = y_points_vals.filter(yv => yv.type === 'single' && yv.position === 'bottom');
  if (cMax.length > 0) {
    bbtExplanation += `* Hàm số đạt **cực đại** tại các điểm cực đại.\n`;
  }
  if (cMin.length > 0) {
    bbtExplanation += `* Hàm số đạt **cực tiểu** tại các điểm cực tiểu.\n`;
  }
  explanation_steps.push({ title: 'Bước 4: Bảng biến thiên và kết luận', content: bbtExplanation.trim() });

  return {
    functionStr,
    functionLatex,
    txd: txdLatex,
    derivative: `y' = ${derivLatex}`,
    x_points,
    y_prime: { points: y_prime_points, intervals: y_prime_intervals },
    y_row,
    latex_code,
    explanation_steps,
    poles,
    criticals: filteredCriticals
  };
}

// 2. Deterministic high school algebra solvers
export function analyzeDeterministic(
  classification: FunctionClassification,
  functionStr: string,
  functionLatex: string,
  node: math.MathNode
): FunctionAnalysis | null {
  const { type, coeffs, numNode, denNode } = classification;

  if (type === 'rational_generic' && numNode && denNode) {
    return solveRationalGeneric(numNode, denNode, functionStr, functionLatex);
  }

  if (type === 'constant') {
    const c = coeffs[0];
    const cLatex = toExactLatex(c);
    const x_points: XPoint[] = [
      { id: 'x-0', latex: '-\\infty', type: 'infinity', value: -Infinity },
      { id: 'x-1', latex: '+\\infty', type: 'infinity', value: Infinity }
    ];
    const y_prime: YPrimeRow = {
      points: ['', ''],
      intervals: ['h']
    };
    const y_row: YRow = {
      points: [
        { type: 'single', latex: cLatex, position: 'middle' },
        { type: 'single', latex: cLatex, position: 'middle' }
      ]
    };
    const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=4.0]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\infty$, $+\\infty$}
\\tkzTabLine{, , }
\\tkzTabVar{-/ $${cLatex}$, +/ $${cLatex}$}
\\end{tikzpicture}`;

    const explanation_steps: ExplanationStep[] = [
      {
        title: 'Bước 1. Tập xác định',
        content: 'Tập xác định của hàm số: $D = \\mathbb{R}$.'
      },
      {
        title: 'Bước 2: Tính đạo hàm y\' và tìm các điểm tới hạn',
        content: 'Ta có đạo hàm $y\' = 0$. Hàm số là hàm hằng (không biến thiên).'
      },
      {
        title: 'Bước 3: Tính các giá trị cực trị, giới hạn, tiệm cận',
        content: `Giới hạn tại vô cực: $\\lim_{x \\to -\\infty} y = ${cLatex}$ và $\\lim_{x \\to +\\infty} y = ${cLatex}$.\nHàm số không có tiệm cận đứng và tiệm cận ngang.`
      },
      {
        title: 'Bước 4: Bảng biến thiên và kết luận',
        content: 'Hàm số không đổi (hằng số) trên toàn bộ miền xác định và không có cực trị.'
      }
    ];

    return { functionStr, functionLatex, txd: 'D = \\mathbb{R}', derivative: '0', x_points, y_prime, y_row, latex_code, explanation_steps };
  }

  if (type === 'linear') {
    const [a, b] = coeffs;
    const aLatex = toExactLatex(a);
    const exprLatex = formatPolyLatex([a, b], [1, 0]);
    
    const x_points: XPoint[] = [
      { id: 'x-0', latex: '-\\infty', type: 'infinity', value: -Infinity },
      { id: 'x-1', latex: '+\\infty', type: 'infinity', value: Infinity }
    ];
    const y_prime: YPrimeRow = {
      points: ['', ''],
      intervals: [a > 0 ? '+' : '-']
    };
    const y_row: YRow = {
      points: [
        { type: 'single', latex: a > 0 ? '-\\infty' : '+\\infty', position: a > 0 ? 'bottom' : 'top' },
        { type: 'single', latex: a > 0 ? '+\\infty' : '-\\infty', position: a > 0 ? 'top' : 'bottom' }
      ]
    };
    
    const yVarLine = a > 0
      ? `- / $-\\infty$, + / $+\\infty$`
      : `+ / $+\\infty$, - / $-\\infty$`;
      
    const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=4.0]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\infty$, $+\\infty$}
\\tkzTabLine{, ${a > 0 ? '+' : '-'}, }
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;

    const explanation_steps: ExplanationStep[] = [
      {
        title: 'Bước 1. Tập xác định',
        content: 'Tập xác định: $D = \\mathbb{R}$.'
      },
      {
        title: 'Bước 2: Tính đạo hàm y\' và tìm các điểm tới hạn',
        content: `Ta có đạo hàm $y' = ${aLatex}$. Vì $y' = ${aLatex} \\neq 0$ với mọi $x \\in \\mathbb{R}$ nên hàm số không có điểm tới hạn.`
      },
      {
        title: 'Bước 3: Tính các giá trị cực trị, giới hạn, tiệm cận',
        content: a > 0
          ? `* Giới hạn tại âm vô cực: $\\lim_{x \\to -\\infty} y = -\\infty$\n* Giới hạn tại dương vô cực: $\\lim_{x \\to +\\infty} y = +\\infty$`
          : `* Giới hạn tại âm vô cực: $\\lim_{x \\to -\\infty} y = +\\infty$\n* Giới hạn tại dương vô cực: $\\lim_{x \\to +\\infty} y = -\\infty$`
      },
      {
        title: 'Bước 4: Bảng biến thiên và kết luận',
        content: `Hàm số **${a > 0 ? 'đồng biến' : 'nghịch biến'}** trên khoảng $(-\\infty; +\\infty)$. Hàm số không có cực trị.`
      }
    ];

    return { functionStr, functionLatex: exprLatex, txd: 'D = \\mathbb{R}', derivative: aLatex, x_points, y_prime, y_row, latex_code, explanation_steps };
  }

  if (type === 'quadratic') {
    const [a, b, c] = coeffs;
    const aLatex = toExactLatex(a);
    const bLatex = toExactLatex(b);
    const exprLatex = formatPolyLatex([a, b, c], [2, 1, 0]);
    const derivLatex = formatPolyLatex([2 * a, b], [1, 0]);
    
    const x0 = -b / (2 * a);
    const y0 = a * x0 * x0 + b * x0 + c;
    const x0Latex = toExactLatex(x0);
    const y0Latex = toExactLatex(y0);
    
    const x_points: XPoint[] = [
      { id: 'x-0', latex: '-\\infty', type: 'infinity', value: -Infinity },
      { id: 'x-1', latex: x0Latex, type: 'critical', value: x0 },
      { id: 'x-2', latex: '+\\infty', type: 'infinity', value: Infinity }
    ];
    const y_prime: YPrimeRow = {
      points: ['', '0', ''],
      intervals: a > 0 ? ['-', '+'] : ['+', '-']
    };
    const y_row: YRow = {
      points: [
        { type: 'single', latex: a > 0 ? '+\\infty' : '-\\infty', position: a > 0 ? 'top' : 'bottom' },
        { type: 'single', latex: y0Latex, position: a > 0 ? 'bottom' : 'top' },
        { type: 'single', latex: a > 0 ? '+\\infty' : '-\\infty', position: a > 0 ? 'top' : 'bottom' }
      ]
    };
    
    const yVarLine = a > 0
      ? `+/ $+\\infty$, -/ $${y0Latex}$, +/ $+\\infty$`
      : `-/ $-\\infty$, +/ $${y0Latex}$, -/ $-\\infty$`;
      
    const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=2.5]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\infty$, $${x0Latex}$, $+\\infty$}
\\tkzTabLine{, ${a > 0 ? '-' : '+'}, z, ${a > 0 ? '+' : '-'}, }
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;

    const limQuadratic = a > 0 ? '+\\infty' : '-\\infty';
    
    const explanation_steps: ExplanationStep[] = [
      {
        title: 'Bước 1. Tập xác định',
        content: 'Tập xác định: $D = \\mathbb{R}$.'
      },
      {
        title: 'Bước 2: Tính đạo hàm y\' và tìm các điểm tới hạn',
        content: `Ta có đạo hàm $y' = ${derivLatex}$.\nCho $y' = 0 \\Leftrightarrow ${derivLatex} = 0 \\Leftrightarrow x = ${x0Latex}$.`
      },
      {
        title: 'Bước 3: Tính các giá trị cực trị, giới hạn, tiệm cận',
        content: `* Giới hạn: $\\lim_{x \\to \\pm\\infty} y = ${limQuadratic}$.\n* Cực trị: Tại $x = ${x0Latex}$, hàm số đạt giá trị cực trị $y = ${y0Latex}$.`
      },
      {
        title: 'Bước 4: Bảng biến thiên và kết luận',
        content: a > 0
          ? `Hàm số nghịch biến trên khoảng $(-\\infty; ${x0Latex})$ và đồng biến trên khoảng $(${x0Latex}; +\\infty)$.\nHàm số đạt **cực tiểu** tại $x = ${x0Latex}$, giá trị cực tiểu $y_{CT} = ${y0Latex}$.`
          : `Hàm số đồng biến trên khoảng $(-\\infty; ${x0Latex})$ và nghịch biến trên khoảng $(${x0Latex}; +\\infty)$.\nHàm số đạt **cực đại** tại $x = ${x0Latex}$, giá trị cực đại $y_{CĐ} = ${y0Latex}$.`
      }
    ];

    return { functionStr, functionLatex: exprLatex, txd: 'D = \\mathbb{R}', derivative: derivLatex, x_points, y_prime, y_row, latex_code, explanation_steps };
  }

  if (type === 'cubic') {
    const [a, b, c, d] = coeffs;
    const exprLatex = formatPolyLatex([a, b, c, d], [3, 2, 1, 0]);
    const derivLatex = formatPolyLatex([3 * a, 2 * b, c], [2, 1, 0]);
    
    const A = 3 * a;
    const B = 2 * b;
    const C = c;
    
    const delta = B * B - 4 * A * C;
    
    if (delta > 1e-5) {
      let r1 = (-B - Math.sqrt(delta)) / (2 * A);
      let r2 = (-B + Math.sqrt(delta)) / (2 * A);
      if (r1 > r2) {
        const tmp = r1;
        r1 = r2;
        r2 = tmp;
      }
      
      const y1 = a * Math.pow(r1, 3) + b * Math.pow(r1, 2) + c * r1 + d;
      const y2 = a * Math.pow(r2, 3) + b * Math.pow(r2, 2) + c * r2 + d;
      
      const r1Latex = toExactLatex(r1);
      const r2Latex = toExactLatex(r2);
      const y1Latex = toExactLatex(y1);
      const y2Latex = toExactLatex(y2);
      
      const x_points: XPoint[] = [
        { id: 'x-0', latex: '-\\infty', type: 'infinity', value: -Infinity },
        { id: 'x-1', latex: r1Latex, type: 'critical', value: r1 },
        { id: 'x-2', latex: r2Latex, type: 'critical', value: r2 },
        { id: 'x-3', latex: '+\\infty', type: 'infinity', value: Infinity }
      ];
      
      const y_prime: YPrimeRow = {
        points: ['', '0', '0', ''],
        intervals: a > 0 ? ['+', '-', '+'] : ['-', '+', '-']
      };
      
      const pos1 = a > 0 ? 'top' : 'bottom';
      const pos2 = a > 0 ? 'bottom' : 'top';
      
      const y_row: YRow = {
        points: [
          { type: 'single', latex: a > 0 ? '-\\infty' : '+\\infty', position: a > 0 ? 'bottom' : 'top' },
          { type: 'single', latex: y1Latex, position: pos1 },
          { type: 'single', latex: y2Latex, position: pos2 },
          { type: 'single', latex: a > 0 ? '+\\infty' : '-\\infty', position: a > 0 ? 'top' : 'bottom' }
        ]
      };
      
      const yVarLine = a > 0
        ? `- / $-\\infty$, +/ $${y1Latex}$, -/ $${y2Latex}$, +/ $+\\infty$`
        : `+/ $+\\infty$, -/ $${y1Latex}$, +/ $${y2Latex}$, -/ $-\\infty$`;
        
      const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=2.0]
  {$x$ / 1, $y'$ / 1, $y$ / 2.5}
  {$-\\infty$, $${r1Latex}$, $${r2Latex}$, $+\\infty$}
\\tkzTabLine{, ${a > 0 ? '+' : '-'}, z, ${a > 0 ? '-' : '+'}, z, ${a > 0 ? '+' : '-'}, }
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;

      const limNeg = a > 0 ? '-\\infty' : '+\\infty';
      const limPos = a > 0 ? '+\\infty' : '-\\infty';
      
      const explanation_steps: ExplanationStep[] = [
        {
          title: 'Bước 1. Tập xác định',
          content: 'Tập xác định: $D = \\mathbb{R}$.'
        },
        {
          title: 'Bước 2: Tính đạo hàm y\' và tìm các điểm tới hạn',
          content: `Ta có đạo hàm $y' = ${derivLatex}$.\nCho $y' = 0 \\Leftrightarrow ${derivLatex} = 0 \\Leftrightarrow x = ${r1Latex}$ hoặc $x = ${r2Latex}$.`
        },
        {
          title: 'Bước 3: Tính các giá trị cực trị, giới hạn, tiệm cận',
          content: `* Giới hạn: $\\lim_{x \\to -\\infty} y = ${limNeg}$ và $\\lim_{x \\to +\\infty} y = ${limPos}$.\n* Cực trị: Hàm số đạt các giá trị cực trị: $y(${r1Latex}) = ${y1Latex}$ và $y(${r2Latex}) = ${y2Latex}$.`
        },
        {
          title: 'Bước 4: Bảng biến thiên và kết luận',
          content: a > 0
            ? `Hàm số đồng biến trên các khoảng $(-\\infty; ${r1Latex})$ và $(${r2Latex}; +\\infty)$, nghịch biến trên khoảng $(${r1Latex}; ${r2Latex})$.\n` +
              `* Hàm số đạt **cực đại** tại $x = ${r1Latex}$, giá trị cực đại $y_{CĐ} = ${y1Latex}$.\n` +
              `* Hàm số đạt **cực tiểu** tại $x = ${r2Latex}$, giá trị cực tiểu $y_{CT} = ${y2Latex}$.`
            : `Hàm số nghịch biến trên các khoảng $(-\\infty; ${r1Latex})$ và $(${r2Latex}; +\\infty)$, đồng biến trên khoảng $(${r1Latex}; ${r2Latex})$.\n` +
              `* Hàm số đạt **cực tiểu** tại $x = ${r1Latex}$, giá trị cực tiểu $y_{CT} = ${y1Latex}$.\n` +
              `* Hàm số đạt **cực đại** tại $x = ${r2Latex}$, giá trị cực đại $y_{CĐ} = ${y2Latex}$.`
        }
      ];

      return { functionStr, functionLatex: exprLatex, txd: 'D = \\mathbb{R}', derivative: derivLatex, x_points, y_prime, y_row, latex_code, explanation_steps };
    } else {
      const x_points: XPoint[] = [
        { id: 'x-0', latex: '-\\infty', type: 'infinity', value: -Infinity },
        { id: 'x-1', latex: '+\\infty', type: 'infinity', value: Infinity }
      ];
      const y_prime: YPrimeRow = {
        points: ['', ''],
        intervals: [a > 0 ? '+' : '-']
      };
      const y_row: YRow = {
        points: [
          { type: 'single', latex: a > 0 ? '-\\infty' : '+\\infty', position: a > 0 ? 'bottom' : 'top' },
          { type: 'single', latex: a > 0 ? '+\\infty' : '-\\infty', position: a > 0 ? 'top' : 'bottom' }
        ]
      };
      
      const yVarLine = a > 0 
        ? `- / $-\\infty$, + / $+\\infty$`
        : `+ / $+\\infty$, - / $-\\infty$`;
        
      const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=4.0]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\infty$, $+\\infty$}
\\tkzTabLine{, ${a > 0 ? '+' : '-'}, }
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;

      const signLatex = a > 0 ? '\\ge 0' : '\\le 0';
      const limNeg = a > 0 ? '-\\infty' : '+\\infty';
      const limPos = a > 0 ? '+\\infty' : '-\\infty';
      
      const explanation_steps: ExplanationStep[] = [
        {
          title: 'Bước 1. Tập xác định',
          content: 'Tập xác định: $D = \\mathbb{R}$.'
        },
        {
          title: 'Bước 2: Tính đạo hàm y\' và tìm các điểm tới hạn',
          content: `Ta có đạo hàm $y' = ${derivLatex}$.\nVì $\\Delta' \\le 0$, phương trình $y' = 0$ vô nghiệm hoặc có nghiệm kép, do đó $y'$ luôn cùng dấu với hệ số $a$ (tức là $y' ${signLatex}$ với mọi $x \\in \\mathbb{R}$). Hàm số không có cực trị.`
        },
        {
          title: 'Bước 3: Tính các giá trị cực trị, giới hạn, tiệm cận',
          content: `Giới hạn tại vô cực: $\\lim_{x \\to -\\infty} y = ${limNeg}$ và $\\lim_{x \\to +\\infty} y = ${limPos}$.`
        },
        {
          title: 'Bước 4: Bảng biến thiên và kết luận',
          content: `Hàm số luôn **${a > 0 ? 'đồng biến' : 'nghịch biến'}** trên $(-\\infty; +\\infty)$ và không có cực trị.`
        }
      ];

      return { functionStr, functionLatex: exprLatex, txd: 'D = \\mathbb{R}', derivative: derivLatex, x_points, y_prime, y_row, latex_code, explanation_steps };
    }
  }

  if (type === 'quartic') {
    const [a, b, c] = coeffs;
    const exprLatex = formatPolyLatex([a, b, c], [4, 2, 0]);
    const derivLatex = formatPolyLatex([4 * a, 2 * b], [3, 1]);
    
    const root2_val = -b / (2 * a);
    
    if (root2_val > 1e-5) {
      const r_val = Math.sqrt(root2_val);
      const rLow = -r_val;
      const rHigh = r_val;
      
      const yMin = a * Math.pow(r_val, 4) + b * Math.pow(r_val, 2) + c;
      const rLowLatex = `-\\sqrt{${toExactLatex(root2_val).replace('-', '')}}`;
      const rHighLatex = `\\sqrt{${toExactLatex(root2_val).replace('-', '')}}`;
      const yMinLatex = toExactLatex(yMin);
      const cLatex = toExactLatex(c);
      
      const x_points: XPoint[] = [
        { id: 'x-0', latex: '-\\infty', type: 'infinity', value: -Infinity },
        { id: 'x-1', latex: rLowLatex, type: 'critical', value: rLow },
        { id: 'x-2', latex: '0', type: 'critical', value: 0 },
        { id: 'x-3', latex: rHighLatex, type: 'critical', value: rHigh },
        { id: 'x-4', latex: '+\\infty', type: 'infinity', value: Infinity }
      ];
      
      const y_prime: YPrimeRow = {
        points: ['', '0', '0', '0', ''],
        intervals: a > 0 ? ['-', '+', '-', '+'] : ['+', '-', '+', '-']
      };
      
      const y_row: YRow = {
        points: [
          { type: 'single', latex: a > 0 ? '+\\infty' : '-\\infty', position: a > 0 ? 'top' : 'bottom' },
          { type: 'single', latex: yMinLatex, position: a > 0 ? 'bottom' : 'top' },
          { type: 'single', latex: cLatex, position: a > 0 ? 'top' : 'bottom' },
          { type: 'single', latex: yMinLatex, position: a > 0 ? 'bottom' : 'top' },
          { type: 'single', latex: a > 0 ? '+\\infty' : '-\\infty', position: a > 0 ? 'top' : 'bottom' }
        ]
      };
      
      const yVarLine = a > 0
        ? `+/ $+\\infty$, -/ $${yMinLatex}$, +/ $${cLatex}$, -/ $${yMinLatex}$, +/ $+\\infty$`
        : `-/ $-\\infty$, +/ $${yMinLatex}$, -/ $${cLatex}$, +/ $${yMinLatex}$, -/ $-\\infty$`;
        
      const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=1.8]
  {$x$ / 1, $y'$ / 1, $y$ / 2.5}
  {$-\\infty$, $${rLowLatex}$, $0$, $${rHighLatex}$, $+\\infty$}
\\tkzTabLine{, ${a > 0 ? '-' : '+'}, z, ${a > 0 ? '+' : '-'}, z, ${a > 0 ? '-' : '+'}, z, ${a > 0 ? '+' : '-'}, }
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;

      const limQuartic = a > 0 ? '+\\infty' : '-\\infty';
      
      const explanation_steps: ExplanationStep[] = [
        {
          title: 'Bước 1. Tập xác định',
          content: 'Tập xác định: $D = \\mathbb{R}$.'
        },
        {
          title: 'Bước 2: Tính đạo hàm y\' và tìm các điểm tới hạn',
          content: `Ta có đạo hàm $y' = ${derivLatex} = 2x(2ax^2 + b)$.\n` +
                   `Cho $y' = 0 \\Leftrightarrow x = 0$ hoặc $x = ${rLowLatex}$ hoặc $x = ${rHighLatex}$.`
        },
        {
          title: 'Bước 3: Tính các giá trị cực trị, giới hạn, tiệm cận',
          content: `* Giới hạn: $\\lim_{x \\to \\pm\\infty} y = ${limQuartic}$.\n` +
                   `* Cực trị: Các giá trị cực trị là $y(0) = ${cLatex}$ và $y(${rLowLatex}) = y(${rHighLatex}) = ${yMinLatex}$.`
        },
        {
          title: 'Bước 4: Bảng biến thiên và kết luận',
          content: a > 0
            ? `Hàm số nghịch biến trên các khoảng $(-\\infty; ${rLowLatex})$ và $(0; ${rHighLatex})$, đồng biến trên các khoảng $(${rLowLatex}; 0)$ và $(${rHighLatex}; +\\infty)$.\n` +
              `* Hàm số đạt **cực đại** tại $x = 0$, giá trị cực đại $y_{CĐ} = ${cLatex}$.\n` +
              `* Hàm số đạt **cực tiểu** tại hai điểm $x = \\pm ${rHighLatex}$, giá trị cực tiểu $y_{CT} = ${yMinLatex}$.`
            : `Hàm số đồng biến trên các khoảng $(-\\infty; ${rLowLatex})$ và $(0; ${rHighLatex})$, nghịch biến trên các khoảng $(${rLowLatex}; 0)$ và $(${rHighLatex}; +\\infty)$.\n` +
              `* Hàm số đạt **cực tiểu** tại $x = 0$, giá trị cực tiểu $y_{CT} = ${cLatex}$.\n` +
              `* Hàm số đạt **cực đại** tại hai điểm $x = \\pm ${rHighLatex}$, giá trị đại $y_{CĐ} = ${yMinLatex}$.`
        }
      ];

      return { functionStr, functionLatex: exprLatex, txd: 'D = \\mathbb{R}', derivative: derivLatex, x_points, y_prime, y_row, latex_code, explanation_steps };
    } else {
      const cLatex = toExactLatex(c);
      const x_points: XPoint[] = [
        { id: 'x-0', latex: '-\\infty', type: 'infinity', value: -Infinity },
        { id: 'x-1', latex: '0', type: 'critical', value: 0 },
        { id: 'x-2', latex: '+\\infty', type: 'infinity', value: Infinity }
      ];
      
      const y_prime: YPrimeRow = {
        points: ['', '0', ''],
        intervals: a > 0 ? ['-', '+'] : ['+', '-']
      };
      
      const y_row: YRow = {
        points: [
          { type: 'single', latex: a > 0 ? '+\\infty' : '-\\infty', position: a > 0 ? 'top' : 'bottom' },
          { type: 'single', latex: cLatex, position: a > 0 ? 'bottom' : 'top' },
          { type: 'single', latex: a > 0 ? '+\\infty' : '-\\infty', position: a > 0 ? 'top' : 'bottom' }
        ]
      };
      
      const yVarLine = a > 0
        ? `+/ $+\\infty$, -/ $${cLatex}$, +/ $+\\infty$`
        : `-/ $-\\infty$, +/ $${cLatex}$, -/ $-\\infty$`;
        
      const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=3.0]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\infty$, $0$, $+\\infty$}
\\tkzTabLine{, ${a > 0 ? '-' : '+'}, z, ${a > 0 ? '+' : '-'}, }
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;

      const limQuartic = a > 0 ? '+\\infty' : '-\\infty';
      
      const explanation_steps: ExplanationStep[] = [
        {
          title: 'Bước 1. Tập xác định',
          content: 'Tập xác định: $D = \\mathbb{R}$.'
        },
        {
          title: 'Bước 2: Tính đạo hàm y\' và tìm các điểm tới hạn',
          content: `Ta có đạo hàm $y' = ${derivLatex}$.\nCho $y' = 0 \\Leftrightarrow x = 0$.`
        },
        {
          title: 'Bước 3: Tính các giá trị cực trị, giới hạn, tiệm cận',
          content: `* Giới hạn: $\\lim_{x \\to \\pm\\infty} y = ${limQuartic}$.\n* Cực trị: Tại $x = 0$, hàm số đạt giá trị cực tiểu/cực đại $y = ${cLatex}$.`
        },
        {
          title: 'Bước 4: Bảng biến thiên và kết luận',
          content: a > 0
            ? `Hàm số nghịch biến trên khoảng $(-\\infty; 0)$ và đồng biến trên khoảng $(0; +\\infty)$.\n* Hàm số đạt **cực tiểu** tại $x = 0$, giá trị cực tiểu $y_{CT} = ${cLatex}$.`
            : `Hàm số đồng biến trên khoảng $(-\\infty; 0)$ và nghịch biến trên khoảng $(0; +\\infty)$.\n* Hàm số đạt **cực đại** tại $x = 0$, giá trị cực đại $y_{CĐ} = ${cLatex}$.`
        }
      ];

      return { functionStr, functionLatex: exprLatex, txd: 'D = \\mathbb{R}', derivative: derivLatex, x_points, y_prime, y_row, latex_code, explanation_steps };
    }
  }

  // Handle simple trigonometric cases (e.g. sin(x), cos(x)) deterministically on [-pi, pi]
  if (type === 'trigonometric') {
    const isSin = functionStr.toLowerCase().includes('sin');
    const isCos = functionStr.toLowerCase().includes('cos');
    
    if (isSin && !functionStr.includes('+') && !functionStr.includes('*')) {
      const x_points: XPoint[] = [
        { id: 'x-0', latex: '-\\pi', type: 'critical', value: -Math.PI },
        { id: 'x-1', latex: '-\\frac{\\pi}{2}', type: 'critical', value: -Math.PI / 2 },
        { id: 'x-2', latex: '\\frac{\\pi}{2}', type: 'critical', value: Math.PI / 2 },
        { id: 'x-3', latex: '\\pi', type: 'critical', value: Math.PI }
      ];
      
      const y_prime: YPrimeRow = {
        points: ['', '0', '0', ''],
        intervals: ['-', '+', '-']
      };
      
      const y_row: YRow = {
        points: [
          { type: 'single', latex: '0', position: 'middle' },
          { type: 'single', latex: '-1', position: 'bottom' },
          { type: 'single', latex: '1', position: 'top' },
          { type: 'single', latex: '0', position: 'middle' }
        ]
      };
      
      const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=2.2]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\pi$, $-\\frac{\\pi}{2}$, $\\frac{\\pi}{2}$, $\\pi$}
\\tkzTabLine{, -, z, +, z, -, }
\\tkzTabVar{+/ $0$, -/ $-1$, +/ $1$, -/ $0$}
\\end{tikzpicture}`;

      const explanation_steps: ExplanationStep[] = [
        {
          title: 'Bước 1. Tập xác định',
          content: 'Tập xác định: $D = \\mathbb{R}$. Khảo sát trên đoạn tuần hoàn $[-\\pi; \\pi]$.'
        },
        {
          title: 'Bước 2: Tính đạo hàm y\' và tìm các điểm tới hạn',
          content: 'Ta có đạo hàm $y\' = \\cos x$. Cho $y\' = 0 \\Leftrightarrow x = \\pm \\frac{\\pi}{2}$ trên đoạn $[-\\pi; \\pi]$.'
        },
        {
          title: 'Bước 3: Tính các giá trị cực trị, giới hạn, tiệm cận',
          content: 'Giá trị hàm số tại các điểm biên và điểm tới hạn:\n' +
                   '* $y(-\\pi) = 0$, $y(\\pi) = 0$.\n' +
                   '* Cực tiểu tại $x = -\\frac{\\pi}{2}$ với $y = -1$.\n' +
                   '* Cực đại tại $x = \\frac{\\pi}{2}$ với $y = 1$.'
        },
        {
          title: 'Bước 4: Bảng biến thiên và kết luận',
          content: 'Hàm số đồng biến trên khoảng $(-\\frac{\\pi}{2}; \\frac{\\pi}{2})$, nghịch biến trên các khoảng $(-\\pi; -\\frac{\\pi}{2})$ và $(\\frac{\\pi}{2}; \\pi)$.'
        }
      ];

      return { functionStr, functionLatex: '\\sin x', txd: 'D = \\mathbb{R}', derivative: '\\cos x', x_points, y_prime, y_row, latex_code, explanation_steps };
    }
    
    if (isCos && !functionStr.includes('+') && !functionStr.includes('*')) {
      const x_points: XPoint[] = [
        { id: 'x-0', latex: '-\\pi', type: 'critical', value: -Math.PI },
        { id: 'x-1', latex: '0', type: 'critical', value: 0 },
        { id: 'x-2', latex: '\\pi', type: 'critical', value: Math.PI }
      ];
      
      const y_prime: YPrimeRow = {
        points: ['', '0', ''],
        intervals: ['+', '-']
      };
      
      const y_row: YRow = {
        points: [
          { type: 'single', latex: '-1', position: 'bottom' },
          { type: 'single', latex: '1', position: 'top' },
          { type: 'single', latex: '-1', position: 'bottom' }
        ]
      };
      
      const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=3.0]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\pi$, $0$, $\\pi$}
\\tkzTabLine{, +, z, -, }
\\tkzTabVar{-/ $-1$, +/ $1$, -/ $-1$}
\\end{tikzpicture}`;

      const explanation_steps: ExplanationStep[] = [
        {
          title: 'Bước 1. Tập xác định',
          content: 'Tập xác định: $D = \\mathbb{R}$. Khảo sát trên đoạn tuần hoàn $[-\\pi; \\pi]$.'
        },
        {
          title: 'Bước 2: Tính đạo hàm y\' và tìm các điểm tới hạn',
          content: 'Ta có đạo hàm $y\' = -\\sin x$. Cho $y\' = 0 \\Leftrightarrow x = 0$ trên đoạn $[-\\pi; \\pi]$ (ở các biên $-\\pi, \\pi$ đạo hàm cũng bằng $0$).'
        },
        {
          title: 'Bước 3: Tính các giá trị cực trị, giới hạn, tiệm cận',
          content: 'Hàm số đạt giá trị cực đại $y = 1$ tại $x = 0$ và đạt giá trị biên cực tiểu $y = -1$ tại $x = \\pm \\pi$.'
        },
        {
          title: 'Bước 4: Bảng biến thiên và kết luận',
          content: 'Hàm số đồng biến trên khoảng $(-\\pi; 0)$ và nghịch biến trên khoảng $(0; \\pi)$.'
        }
      ];

      return { functionStr, functionLatex: '\\cos x', txd: 'D = \\mathbb{R}', derivative: '-\\sin x', x_points, y_prime, y_row, latex_code, explanation_steps };
    }
  }

  return null;
}

// Extract denominators to find poles (rational functions)
function getDenominators(node: math.MathNode): string[] {
  const denoms: string[] = [];
  node.traverse((child) => {
    if (child.type === 'OperatorNode' && (child as any).op === '/') {
      denoms.push((child as any).args[1].toString());
    }
  });
  return denoms;
}

// Find roots of an expression in [-20, 20]
function findRoots(node: math.MathNode, variable: string = 'x'): number[] {
  let compiled: math.EvalFunction;
  try {
    compiled = node.compile();
  } catch (err) {
    return [];
  }
  
  const roots: number[] = [];
  const start = -15;
  const end = 15;
  const step = 0.02; // Fine step to capture close roots
  
  let prevVal: any;
  try {
    prevVal = compiled.evaluate({ [variable]: start });
  } catch (e) {
    prevVal = undefined;
  }
  
  for (let x = start + step; x <= end; x += step) {
    let val: any;
    try {
      val = compiled.evaluate({ [variable]: x });
    } catch {
      continue;
    }
    
    if (typeof val !== 'number' || isNaN(val)) continue;
    
    // Check for exact zero
    if (Math.abs(val) < 1e-9) {
      if (!roots.some(r => Math.abs(r - x) < 1e-4)) {
        roots.push(x);
      }
    } 
    // Check for sign change (if continuous and cross 0)
    else if (prevVal !== undefined && typeof prevVal === 'number' && !isNaN(prevVal) && prevVal * val < 0) {
      let left = x - step;
      let right = x;
      let root = left;
      for (let iter = 0; iter < 40; iter++) {
        const mid = (left + right) / 2;
        let midVal: any;
        try {
          midVal = compiled.evaluate({ [variable]: mid });
        } catch {
          midVal = NaN;
        }
        if (isNaN(midVal)) {
          break;
        }
        if (Math.abs(midVal) < 1e-12) {
          root = mid;
          break;
        }
        if (midVal * compiled.evaluate({ [variable]: left }) < 0) {
          right = mid;
        } else {
          left = mid;
        }
        root = mid;
      }
      if (!roots.some(r => Math.abs(r - root) < 1e-4)) {
        roots.push(root);
      }
    }
    prevVal = val;
  }
  
  return roots.sort((a, b) => a - b);
}

// Fully automated math analyzer using mathjs CAS with deterministic high school solvers
export function analyzeFunctionCAS(functionStr: string): FunctionAnalysis {
  let normalized = functionStr
    .replace(/y\s*=\s*/g, '')
    .replace(/f\(x\)\s*=\s*/g, '')
    .trim();

  if (!normalized) {
    normalized = "x^3 - 3*x + 2";
  }

  normalized = preprocessImplicitMultiplication(normalized);

  const node = math.parse(normalized);
  const functionLatex = node.toTex({ parenthesis: 'keep' });

  // 1. Try our high school curriculum deterministic algebra solver first!
  const classification = classifyFunction(node);
  console.log(`[CAS Engine] Phân loại hàm số: ${classification.type}`, classification.coeffs);
  
  const deterministicResult = analyzeDeterministic(classification, functionStr, functionLatex, node);
  if (deterministicResult) {
    console.log(`[CAS Engine] Phân tích giải tích thành công bằng bộ giải toán phổ thông.`);
    
    // Post-process to extract poles and criticals for GTLN/GTNN calculator
    const poles = deterministicResult.x_points
      .filter(p => p.type === 'discontinuity' && p.value !== undefined && isFinite(p.value))
      .map(p => p.value!);
    const criticals = deterministicResult.x_points
      .filter(p => p.type === 'critical' && p.value !== undefined && isFinite(p.value))
      .map(p => p.value!);
      
    return {
      ...deterministicResult,
      poles,
      criticals
    };
  }

  // 2. Numerical/Symbolic fallback for other/complex math expressions
  console.log(`[CAS Engine] Chuyển sang bộ giải CAS số học tổng quát...`);
  const yEval = node.compile();

  // Find Poles
  const denoms = getDenominators(node);
  const polesSet = new Set<number>();
  denoms.forEach((denomStr) => {
    try {
      const denomNode = math.parse(denomStr);
      const roots = findRoots(denomNode);
      roots.forEach(r => polesSet.add(parseFloat(r.toFixed(5))));
    } catch (e) {
      // ignore
    }
  });
  const poles = Array.from(polesSet).sort((a, b) => a - b);

  // Symbolic Derivative
  const dy = math.derivative(node, 'x');
  const dySimplified = math.simplify(dy);
  const derivative = dySimplified.toTex();
  const dyEval = dySimplified.compile();

  // Find Critical Points
  const rawCriticals = findRoots(dySimplified);
  const criticals = rawCriticals.filter(c => {
    if (poles.some(p => Math.abs(p - c) < 1e-3)) return false;
    try {
      const leftVal = dyEval.evaluate({ x: c - 1e-4 });
      const rightVal = dyEval.evaluate({ x: c + 1e-4 });
      return leftVal * rightVal < -1e-10;
    } catch {
      return true;
    }
  });

  // Construct X-Row Points
  const x_points: XPoint[] = [];
  x_points.push({ id: 'x-0', latex: '-\\infty', type: 'infinity', value: -Infinity });

  let pointCounter = 1;
  const sortedMilestones = [...poles.map(p => ({ val: p, type: 'discontinuity' as const })), ...criticals.map(c => ({ val: c, type: 'critical' as const }))]
    .sort((a, b) => a.val - b.val);

  const uniqueMilestones: { val: number; type: 'critical' | 'discontinuity' }[] = [];
  sortedMilestones.forEach(m => {
    if (!uniqueMilestones.some(u => Math.abs(u.val - m.val) < 1e-4)) {
      uniqueMilestones.push(m);
    }
  });

  uniqueMilestones.forEach(m => {
    const exactLatex = toExactLatex(m.val);
    const parsedVal = parseLatexToVal(exactLatex);
    x_points.push({
      id: `x-${pointCounter++}`,
      latex: exactLatex,
      type: m.type,
      value: parsedVal !== null ? parsedVal : m.val
    });
  });

  x_points.push({ id: `x-${pointCounter}`, latex: '+\\infty', type: 'infinity', value: Infinity });
  const N = x_points.length;

  // Compute Y' signs
  const y_prime_points: ('0' | 'd' | '')[] = [];
  const y_prime_intervals: ('+' | '-' | 'h')[] = [];

  x_points.forEach((p) => {
    if (p.type === 'infinity') {
      y_prime_points.push('');
    } else if (p.type === 'discontinuity') {
      y_prime_points.push('d');
    } else {
      y_prime_points.push('0');
    }
  });

  for (let i = 0; i < N - 1; i++) {
    const left = x_points[i].value!;
    const right = x_points[i + 1].value!;
    
    let xMid = 0;
    if (left === -Infinity && right === Infinity) {
      xMid = 0;
    } else if (left === -Infinity) {
      xMid = right - 1.5;
    } else if (right === Infinity) {
      xMid = left + 1.5;
    } else {
      xMid = (left + right) / 2;
    }

    try {
      const dVal = dyEval.evaluate({ x: xMid });
      if (typeof dVal === 'number' && !isNaN(dVal)) {
        if (dVal > 1e-7) {
          y_prime_intervals.push('+');
        } else if (dVal < -1e-7) {
          y_prime_intervals.push('-');
        } else {
          y_prime_intervals.push('+');
        }
      } else {
        y_prime_intervals.push('h');
      }
    } catch {
      y_prime_intervals.push('h');
    }
  }

  // Compute Y values
  const y_points_vals: YPointValue[] = [];

  x_points.forEach((p, idx) => {
    if (p.type === 'infinity') {
      const testVal = p.value === -Infinity ? -1000 : 1000;
      let limitVal: any;
      try {
        limitVal = yEval.evaluate({ x: testVal });
      } catch {
        limitVal = p.value === -Infinity ? -Infinity : Infinity;
      }

      if (typeof limitVal !== 'number' || isNaN(limitVal)) {
        if (p.value === -Infinity) {
          const firstIntervalSign = y_prime_intervals[0];
          const yPos = firstIntervalSign === '+' ? 'bottom' : 'top';
          y_points_vals.push({
            type: 'single',
            latex: firstIntervalSign === '+' ? '-\\infty' : '+\\infty',
            position: yPos
          });
        } else {
          const lastIntervalSign = y_prime_intervals[y_prime_intervals.length - 1];
          const yPos = lastIntervalSign === '+' ? 'top' : 'bottom';
          y_points_vals.push({
            type: 'single',
            latex: lastIntervalSign === '+' ? '+\\infty' : '-\\infty',
            position: yPos
          });
        }
      } else {
        if (limitVal < -50) {
          y_points_vals.push({ type: 'single', latex: '-\\infty', position: 'bottom' });
        } else if (limitVal > 50) {
          y_points_vals.push({ type: 'single', latex: '+\\infty', position: 'top' });
        } else {
          y_points_vals.push({ type: 'single', latex: toExactLatex(limitVal), position: 'middle' });
        }
      }
    } else if (p.type === 'discontinuity') {
      const poleVal = p.value!;
      const epsilon = 1e-5;
      
      let leftLim: any;
      try {
        leftLim = yEval.evaluate({ x: poleVal - epsilon });
      } catch {
        leftLim = -Infinity;
      }

      let rightLim: any;
      try {
        rightLim = yEval.evaluate({ x: poleVal + epsilon });
      } catch {
        rightLim = Infinity;
      }

      const latexLeft = (typeof leftLim === 'number' && !isNaN(leftLim))
        ? (leftLim < -50 ? '-\\infty' : (leftLim > 50 ? '+\\infty' : toExactLatex(leftLim)))
        : (y_prime_intervals[idx - 1] === '+' ? '+\\infty' : '-\\infty');

      const latexRight = (typeof rightLim === 'number' && !isNaN(rightLim))
        ? (rightLim < -50 ? '-\\infty' : (rightLim > 50 ? '+\\infty' : toExactLatex(rightLim)))
        : (y_prime_intervals[idx] === '+' ? '-\\infty' : '+\\infty');

      const positionLeft = latexLeft.includes('-\\infty') ? 'bottom' : (latexLeft.includes('+\\infty') ? 'top' : 'middle');
      const positionRight = latexRight.includes('-\\infty') ? 'bottom' : (latexRight.includes('+\\infty') ? 'top' : 'middle');

      y_points_vals.push({ type: 'discontinuity', latexLeft, positionLeft, latexRight, positionRight });
    } else {
      const critVal = p.value!;
      let val: any;
      try {
        val = yEval.evaluate({ x: critVal });
      } catch {
        val = 0;
      }

      const leftSign = y_prime_intervals[idx - 1];
      const rightSign = y_prime_intervals[idx];
      let position: 'top' | 'middle' | 'bottom' = 'middle';

      if (leftSign === '+' && rightSign === '-') {
        position = 'top';
      } else if (leftSign === '-' && rightSign === '+') {
        position = 'bottom';
      }

      y_points_vals.push({
        type: 'single',
        latex: (typeof val === 'number' && !isNaN(val)) ? toExactLatex(val) : '0',
        position
      });
    }
  });

  y_points_vals.forEach((yv, i) => {
    if (yv.type === 'single') {
      if (x_points[i].type === 'infinity') {
        if (yv.latex === '-\\infty') {
          yv.position = 'bottom';
        } else if (yv.latex === '+\\infty') {
          yv.position = 'top';
        } else {
          if (i === 0) {
            const nextSign = y_prime_intervals[0];
            yv.position = nextSign === '+' ? 'bottom' : 'top';
          } else if (i === N - 1) {
            const prevSign = y_prime_intervals[y_prime_intervals.length - 1];
            yv.position = prevSign === '+' ? 'top' : 'bottom';
          }
        }
      }
    }
  });

  const y_row: YRow = { points: y_points_vals };

  // Generate tkz-tab code
  const espcl = Math.max(1.5, parseFloat((8.0 / (N - 1)).toFixed(1)));
  const xList = x_points.map(p => `$${p.latex}$`).join(', ');
  
  const yPrimeLineParts: string[] = [];
  for (let i = 0; i < N; i++) {
    if (i === 0) {
      yPrimeLineParts.push('');
    } else {
      yPrimeLineParts.push(y_prime_intervals[i - 1]);
    }
    if (x_points[i].type === 'discontinuity') {
      yPrimeLineParts.push('d');
    } else if (x_points[i].type === 'critical') {
      yPrimeLineParts.push('z');
    } else if (i > 0 && i < N - 1) {
      yPrimeLineParts.push('');
    }
  }
  yPrimeLineParts.push('');
  const yPrimeLine = yPrimeLineParts.join(', ');

  const yVarParts: string[] = [];
  y_points_vals.forEach((yv, i) => {
    if (yv.type === 'single') {
      const sign = yv.position === 'top' ? '+' : '-';
      yVarParts.push(`${sign}/ $${yv.latex}$`);
    } else {
      const leftSign = yv.positionLeft === 'top' ? '+' : '-';
      const rightSign = yv.positionRight === 'top' ? '+' : '-';
      yVarParts.push(`${leftSign}D${rightSign}/ $${yv.latexLeft}$ / $${yv.latexRight}$`);
    }
  });
  const yVarLine = yVarParts.join(', ');

  const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=${espcl}]
  {$x$ / 1, $y'$ / 1, $y$ / 2.5}
  {${xList}}
\\tkzTabLine{${yPrimeLine}}
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;

  // Explanation steps
  const explanation_steps: ExplanationStep[] = [];

  let txdLatex = 'D = \\mathbb{R}';
  let txdContent = 'Tập xác định của hàm số: $D = \\mathbb{R}$.';
  if (poles.length > 0) {
    const poleLatexList = poles.map(p => toExactLatex(p)).join('; ');
    txdLatex = `D = \\mathbb{R} \\setminus \\{${poleLatexList}\\}`;
    txdContent = `Tập xác định của hàm số: $D = \\mathbb{R} \\setminus \\{${poleLatexList}\\}$.`;
  }
  explanation_steps.push({ title: 'Bước 1. Tập xác định', content: txdContent });

  let derivativeExplanation = `Ta có đạo hàm $y' = ${derivative}$. `;
  if (criticals.length > 0) {
    const rootEquations = criticals.map(c => `x = ${toExactLatex(c)}`).join(', ');
    derivativeExplanation += `Cho $y' = 0 \\Leftrightarrow ${rootEquations}$. `;
  } else {
    derivativeExplanation += `Ta thấy $y' \\neq 0$ với mọi $x \\in D$. `;
  }
  if (poles.length > 0) {
    const poleLatexList = poles.map(p => `$x = ${toExactLatex(p)}$`).join(', ');
    derivativeExplanation += `Đạo hàm không xác định tại ${poleLatexList}.`;
  }
  explanation_steps.push({ title: "Bước 2: Tính đạo hàm y' và tìm các điểm tới hạn", content: derivativeExplanation.trim() });

  let limitExplanation = `Tính giới hạn tại vô cực và tại các điểm gián đoạn:\n`;
  if (poles.length > 0) {
    limitExplanation += `* Tiệm cận đứng: `;
    poles.forEach(p => {
      const pLatex = toExactLatex(p);
      limitExplanation += `$\\displaystyle \\lim_{x \\to ${pLatex}^-} y = \\pm\\infty$ và $\\displaystyle \\lim_{x \\to ${pLatex}^+} y = \\pm\\infty$, do đó $x = ${pLatex}$ là tiệm cận đứng. `;
    });
    limitExplanation += `\n`;
  }
  limitExplanation += `* Giới hạn tại vô cực: $\\displaystyle \\lim_{x \\to -\\infty} y$ và $\\displaystyle \\lim_{x \\to +\\infty} y$ được xác định dựa trên bậc cao nhất.\n`;
  explanation_steps.push({ title: 'Bước 3: Tính các giá trị cực trị, giới hạn, tiệm cận', content: limitExplanation.trim() });

  let bbtExplanation = `Dựa vào bảng biến thiên, kết luận:\n`;
  y_prime_intervals.forEach((sign, i) => {
    const leftX = x_points[i].latex;
    const rightX = x_points[i + 1].latex;
    bbtExplanation += `* Hàm số **${sign === '+' ? 'đồng biến' : 'nghịch biến'}** trên khoảng $(${leftX}; ${rightX})$.\n`;
  });
  explanation_steps.push({ title: 'Bước 4: Bảng biến thiên và kết luận', content: bbtExplanation });

  return { functionStr, functionLatex, txd: txdLatex, derivative, x_points, y_prime: { points: y_prime_points, intervals: y_prime_intervals }, y_row, latex_code, explanation_steps, poles, criticals };
}
