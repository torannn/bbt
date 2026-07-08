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
  
  // Try simple fractions with denominators up to 12
  const signStr = val < 0 ? "-" : "";
  const absVal = Math.abs(val);
  for (let denom = 2; denom <= 12; denom++) {
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
  for (let denom = 1; denom <= 16; denom++) {
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

// Extract denominators to find poles
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
      // Bisection method to find high-precision root
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

// Fully automated math analyzer using mathjs CAS
export function analyzeFunctionCAS(functionStr: string): FunctionAnalysis {
  // Normalize formula: handle Vietnamese terms and spacing
  let normalized = functionStr
    .replace(/y\s*=\s*/g, '')
    .replace(/f\(x\)\s*=\s*/g, '')
    .trim();

  // If empty, fallback to default
  if (!normalized) {
    normalized = "x^3 - 3*x + 2";
  }

  // Preprocess implicit multiplications like "2x" -> "2*x", "ab" -> "a*b", "x(x-1)" -> "x*(x-1)"
  normalized = preprocessImplicitMultiplication(normalized);

  // Parse expression
  const node = math.parse(normalized);
  const functionLatex = node.toTex({ parenthesis: 'keep' });

  // Compile function for evaluations
  const yEval = node.compile();

  // 1. Find Poles (discontinuities where denominator is 0)
  const denoms = getDenominators(node);
  const polesSet = new Set<number>();
  denoms.forEach((denomStr) => {
    try {
      const denomNode = math.parse(denomStr);
      const roots = findRoots(denomNode);
      roots.forEach(r => polesSet.add(parseFloat(r.toFixed(5))));
    } catch (e) {
      // Ignore parse errors on individual denominators
    }
  });
  const poles = Array.from(polesSet).sort((a, b) => a - b);

  // 2. Symbolic Derivative
  const dy = math.derivative(node, 'x');
  const dySimplified = math.simplify(dy);
  const derivative = dySimplified.toTex();
  const dyEval = dySimplified.compile();

  // 3. Find Critical Points (where derivative is 0)
  // Scan dySimplified to find roots
  const rawCriticals = findRoots(dySimplified);
  // Filter out critical points that are exactly at poles (since derivative is not defined there)
  const criticals = rawCriticals.filter(c => !poles.some(p => Math.abs(p - c) < 1e-3));

  // 4. Construct X-Row Points
  const x_points: XPoint[] = [];
  x_points.push({ id: 'x-0', latex: '-\\infty', type: 'infinity', value: -Infinity });

  let pointCounter = 1;
  const sortedMilestones = [...poles.map(p => ({ val: p, type: 'discontinuity' as const })), ...criticals.map(c => ({ val: c, type: 'critical' as const }))]
    .sort((a, b) => a.val - b.val);

  // Merge identical milestones if any
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

  // 5. Compute Y' signs (Dòng đạo hàm)
  const y_prime_points: ('0' | 'd' | '')[] = [];
  const y_prime_intervals: ('+' | '-' | 'h')[] = [];

  // Points
  x_points.forEach((p) => {
    if (p.type === 'infinity') {
      y_prime_points.push('');
    } else if (p.type === 'discontinuity') {
      y_prime_points.push('d'); // double bar (||)
    } else {
      y_prime_points.push('0'); // root of y'
    }
  });

  // Intervals
  for (let i = 0; i < N - 1; i++) {
    const left = x_points[i].value!;
    const right = x_points[i + 1].value!;
    
    // Pick mid test point
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
          y_prime_intervals.push('+'); // fallback
        }
      } else {
        y_prime_intervals.push('h'); // forbidden zone
      }
    } catch {
      y_prime_intervals.push('h');
    }
  }

  // 6. Compute Y values and arrows (Dòng giá trị Y)
  const y_points_vals: YPointValue[] = [];

  x_points.forEach((p, idx) => {
    if (p.type === 'infinity') {
      // Limits at infinity
      const testVal = p.value === -Infinity ? -1000 : 1000;
      let limitVal: any;
      try {
        limitVal = yEval.evaluate({ x: testVal });
      } catch {
        limitVal = p.value === -Infinity ? -Infinity : Infinity;
      }

      if (typeof limitVal !== 'number' || isNaN(limitVal)) {
        // Analytical fallback based on first/last interval sign
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
      // Discontinuity limits
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

      y_points_vals.push({
        type: 'discontinuity',
        latexLeft,
        positionLeft,
        latexRight,
        positionRight
      });
    } else {
      // Critical point exact value
      const critVal = p.value!;
      let val: any;
      try {
        val = yEval.evaluate({ x: critVal });
      } catch {
        val = 0;
      }

      // Determine position (top/bottom) using the sign changes of y'
      const leftSign = y_prime_intervals[idx - 1];
      const rightSign = y_prime_intervals[idx];
      let position: 'top' | 'middle' | 'bottom' = 'middle';

      if (leftSign === '+' && rightSign === '-') {
        position = 'top'; // local maximum
      } else if (leftSign === '-' && rightSign === '+') {
        position = 'bottom'; // local minimum
      }

      y_points_vals.push({
        type: 'single',
        latex: (typeof val === 'number' && !isNaN(val)) ? toExactLatex(val) : '0',
        position
      });
    }
  });

  // Post-process limits at infinity positions to make sure the arrow vectors are aligned
  // If the arrow goes from left (-inf) to right, adjust the position
  y_points_vals.forEach((yv, i) => {
    if (yv.type === 'single') {
      if (x_points[i].type === 'infinity') {
        if (yv.latex === '-\\infty') {
          yv.position = 'bottom';
        } else if (yv.latex === '+\\infty') {
          yv.position = 'top';
        } else {
          // Horizontal asymptote positioning
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

  // 7. Generate tkz-tab LaTeX code
  const espcl = Math.max(1.5, parseFloat((8.0 / (N - 1)).toFixed(1)));
  const xList = x_points.map(p => `$${p.latex}$`).join(', ');
  
  // Line of signs (y')
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
      yPrimeLineParts.push('z'); // 'z' stands for 0 in tkz-tab
    } else if (i > 0 && i < N - 1) {
      yPrimeLineParts.push('');
    }
  }
  yPrimeLineParts.push(''); // tail
  const yPrimeLine = yPrimeLineParts.join(', ');

  // Line of variation (y)
  // Format in tkz-tab: -/ $-\infty$, +D-/ $+\infty$ / $-\infty$, etc.
  const yVarParts: string[] = [];
  y_points_vals.forEach((yv, i) => {
    if (yv.type === 'single') {
      const sign = yv.position === 'top' ? '+' : '-';
      yVarParts.push(`${sign}/ $${yv.latex}$`);
    } else {
      // Discontinuity double line
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

  // 8. Generate Vietnamese Explanation Steps
  const explanation_steps: ExplanationStep[] = [];

  // Step 1: TXD
  let txdLatex = 'D = \\mathbb{R}';
  let txdContent = 'Tập xác định: $D = \\mathbb{R}$.';
  if (poles.length > 0) {
    const poleLatexList = poles.map(p => toExactLatex(p)).join('; ');
    txdLatex = `D = \\mathbb{R} \\setminus \\{${poleLatexList}\\}`;
    txdContent = `Tập xác định: $D = \\mathbb{R} \\setminus \\{${poleLatexList}\\}$.`;
  }
  explanation_steps.push({
    title: 'Bước 1. Tập xác định',
    content: txdContent
  });

  // Step 2: Đạo hàm
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

  explanation_steps.push({
    title: "Bước 2: Tính đạo hàm y' và tìm các điểm tới hạn",
    content: derivativeExplanation.trim()
  });

  // Step 3: Giới hạn và tiệm cận
  let limitExplanation = `Tính các giá trị cực trị và giới hạn:\n`;
  if (poles.length > 0) {
    limitExplanation += `* Tiệm cận đứng: `;
    poles.forEach(p => {
      const pLatex = toExactLatex(p);
      limitExplanation += `$\\displaystyle \\lim_{x \\to ${pLatex}^-} y = \\pm\\infty$ và $\\displaystyle \\lim_{x \\to ${pLatex}^+} y = \\pm\\infty$, suy ra $x = ${pLatex}$ là tiệm cận đứng. `;
    });
    limitExplanation += `\n`;
  }
  limitExplanation += `* Giới hạn tại vô cực: $\\displaystyle \\lim_{x \\to -\\infty} y$ và $\\displaystyle \\lim_{x \\to +\\infty} y$ được xác định dựa trên hàm số (tiệm cận ngang nếu có).\n`;
  explanation_steps.push({
    title: 'Bước 3: Lập bảng biến thiên đồng thời tính các giá trị cực trị, giới hạn tại vô cực, tiệm cận (nếu có)',
    content: limitExplanation.trim()
  });

  // Step 4: Bảng biến thiên
  let bbtExplanation = `Kết luận các tính chất của hàm số:\n`;
  y_prime_intervals.forEach((sign, i) => {
    const leftX = x_points[i].latex;
    const rightX = x_points[i + 1].latex;
    bbtExplanation += `* Hàm số **${sign === '+' ? 'đồng biến' : 'nghịch biến'}** trên khoảng $(${leftX}; ${rightX})$.\n`;
  });
  explanation_steps.push({
    title: 'Bước 4: Lập bảng biến thiên và nêu kết luận: khoảng đơn điệu, cực trị, tiệm cận.',
    content: bbtExplanation
  });

  return {
    functionStr,
    functionLatex,
    txd: txdLatex,
    derivative,
    x_points,
    y_prime: { points: y_prime_points, intervals: y_prime_intervals },
    y_row,
    latex_code,
    explanation_steps,
    poles,
    criticals
  };
}
