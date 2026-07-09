var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");

// src/lib/cas.ts
var math = __toESM(require("mathjs"), 1);
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}
function toExactLatex(val) {
  if (Math.abs(val) < 1e-9) return "0";
  const rounded = Math.round(val);
  if (Math.abs(val - rounded) < 1e-5) {
    return rounded.toString();
  }
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
  const val2 = val * val;
  for (let denom = 1; denom <= 36; denom++) {
    const numer = Math.round(val2 * denom);
    if (Math.abs(val2 - numer / denom) < 1e-4) {
      if (denom === 1) {
        return `${val < 0 ? "-" : ""}\\sqrt{${numer}}`;
      } else {
        const sn = Math.sqrt(numer);
        const sd = Math.sqrt(denom);
        const sn_r = Math.round(sn);
        const sd_r = Math.round(sd);
        if (Math.abs(sn - sn_r) < 1e-5 && Math.abs(sd - sd_r) < 1e-5) {
          const g = gcd(sn_r, sd_r);
          const n = sn_r / g;
          const d = sd_r / g;
          if (d === 1) return `${val < 0 ? "-" : ""}${n}`;
          return `${val < 0 ? "-" : ""}\\frac{${n}}{${d}}`;
        }
        if (Math.abs(sd - sd_r) < 1e-5) {
          return `${val < 0 ? "-" : ""}\\frac{\\sqrt{${numer}}}{${sd_r}}`;
        }
      }
    }
  }
  return val.toFixed(2).replace(/\.00$/, "");
}
function parseLatexToVal(latex) {
  if (!latex) return null;
  if (/^-?\d+$/.test(latex)) {
    return parseInt(latex, 10);
  }
  const fracMatch = latex.match(/^(-)?\\frac\{(\d+)\}\{(\d+)\}$/);
  if (fracMatch) {
    const isNeg = !!fracMatch[1];
    const num = parseInt(fracMatch[2], 10);
    const den = parseInt(fracMatch[3], 10);
    return (isNeg ? -1 : 1) * (num / den);
  }
  const sqrtMatch = latex.match(/^(-)?\\sqrt\{(\d+)\}$/);
  if (sqrtMatch) {
    const isNeg = !!sqrtMatch[1];
    const radicand = parseInt(sqrtMatch[2], 10);
    return (isNeg ? -1 : 1) * Math.sqrt(radicand);
  }
  const sqrtFracMatch = latex.match(/^(-)?\\frac\{\\sqrt\{(\d+)\}\}\{(\d+)\}$/);
  if (sqrtFracMatch) {
    const isNeg = !!sqrtFracMatch[1];
    const radicand = parseInt(sqrtFracMatch[2], 10);
    const den = parseInt(sqrtFracMatch[3], 10);
    return (isNeg ? -1 : 1) * (Math.sqrt(radicand) / den);
  }
  return null;
}
function preprocessImplicitMultiplication(expr) {
  if (!expr) return expr;
  let current = expr;
  current = current.replace(/÷/g, "/");
  current = current.replace(/([0-9])\s*([a-zA-Z\(\\])/g, "$1*$2");
  current = current.replace(/\)\s*\(/g, ")*(");
  current = current.replace(/\)\s*([a-zA-Z\\])/g, ")*$1");
  current = current.replace(/\b(x|e)\s*\(/gi, "$1*(");
  current = current.replace(/\b(x)\s+([a-zA-Z])/gi, "$1*$2");
  current = current.replace(/\b(x)(ln|lg|log|sin|cos|tan|cot|sqrt|exp)\b/gi, "$1*$2");
  current = current.replace(/\b([a-df-wyz])\s*x\b/gi, "$1*x");
  current = current.replace(/\b([a-df-wyz])\s*\(/gi, "$1*(");
  return current;
}
function formatPolyLatex(coeffs, powers) {
  let latex = "";
  coeffs.forEach((c, idx) => {
    const power = powers[idx];
    if (Math.abs(c) < 1e-6) return;
    const sign = c < 0 ? "-" : latex === "" ? "" : "+";
    const absC = Math.abs(c);
    let coeffStr = "";
    if (power === 0) {
      coeffStr = toExactLatex(absC);
    } else {
      coeffStr = Math.abs(absC - 1) < 1e-6 ? "" : toExactLatex(absC);
    }
    let varStr = "";
    if (power > 0) {
      varStr = power === 1 ? "x" : `x^{${power}}`;
    }
    latex += `${sign}${coeffStr}${varStr}`;
  });
  return latex || "0";
}
function isPolynomialNode(n) {
  let valid = true;
  try {
    n.traverse((child) => {
      if (child.type === "FunctionNode") {
        valid = false;
      }
      if (child.type === "OperatorNode") {
        const op = child.op;
        if (!["+", "-", "*", "/", "^"].includes(op)) {
          valid = false;
        }
        if (op === "/") {
          valid = false;
        }
        if (op === "^") {
          const exponent = child.args[1];
          if (exponent.type !== "ConstantNode" || !Number.isInteger(exponent.value) || exponent.value < 0) {
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
function classifyFunction(node) {
  let hasTrig = false;
  let hasLog = false;
  let hasExp = false;
  node.traverse((child) => {
    if (child.type === "FunctionNode") {
      const name = child.name;
      if (["sin", "cos", "tan", "cot"].includes(name)) {
        hasTrig = true;
      }
      if (["ln", "log", "log10"].includes(name)) {
        hasLog = true;
      }
      if (name === "exp") {
        hasExp = true;
      }
    }
    if (child.type === "OperatorNode" && child.op === "^") {
      const exponent = child.args[1];
      const variables = [];
      exponent.traverse((expChild) => {
        if (expChild.type === "SymbolNode" && expChild.name === "x") {
          variables.push("x");
        }
      });
      if (variables.length > 0) {
        hasExp = true;
      }
    }
  });
  const isPureTrig = (n) => {
    if (n.type === "FunctionNode") {
      const name = n.name;
      if (["sin", "cos"].includes(name)) {
        const arg = n.args[0];
        return arg && arg.type === "SymbolNode" && arg.name === "x";
      }
    }
    if (n.type === "OperatorNode" && n.op === "-" && n.args.length === 1) {
      return isPureTrig(n.args[0]);
    }
    return false;
  };
  if (hasTrig && isPureTrig(node)) return { type: "trigonometric", coeffs: [] };
  if (hasLog) return { type: "logarithmic", coeffs: [] };
  if (hasExp) return { type: "exponential", coeffs: [] };
  let rationalized;
  try {
    rationalized = math.rationalize(node);
  } catch {
    rationalized = node;
  }
  if (rationalized.type === "OperatorNode" && rationalized.op === "/") {
    const numNode = rationalized.args[0];
    const denNode = rationalized.args[1];
    if (isPolynomialNode(numNode) && isPolynomialNode(denNode)) {
      const denStr = denNode.toString();
      if (denStr.includes("x")) {
        return { type: "rational_generic", coeffs: [], numNode, denNode };
      }
    }
  }
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
    const polyValid = Math.abs(a * 81 + b * 27 + c * 9 + d * 3 + e - comp.evaluate({ x: 3 })) < 1e-4;
    if (polyValid) {
      if (Math.abs(a) > 1e-5) {
        if (Math.abs(b) < 1e-4 && Math.abs(d) < 1e-4) {
          return { type: "quartic", coeffs: [a, c, e] };
        }
      } else if (Math.abs(b) > 1e-5) {
        return { type: "cubic", coeffs: [b, c, d, e] };
      } else if (Math.abs(c) > 1e-5) {
        return { type: "quadratic", coeffs: [c, d, e] };
      } else if (Math.abs(d) > 1e-5) {
        return { type: "linear", coeffs: [d, e] };
      }
      return { type: "constant", coeffs: [e] };
    }
  } catch {
  }
  return { type: "other", coeffs: [] };
}
function solveRationalGeneric(numNode, denNode, functionStr, functionLatex) {
  const P = numNode.compile();
  const Q = denNode.compile();
  const evalP = (x) => {
    try {
      const val = P.evaluate({ x });
      return typeof val === "number" && !isNaN(val) ? val : NaN;
    } catch {
      return NaN;
    }
  };
  const evalQ = (x) => {
    try {
      const val = Q.evaluate({ x });
      return typeof val === "number" && !isNaN(val) ? val : NaN;
    } catch {
      return NaN;
    }
  };
  const evalY = (x) => {
    const q = evalQ(x);
    if (Math.abs(q) < 1e-9 || isNaN(q)) return NaN;
    const p = evalP(x);
    return p / q;
  };
  const poles = findRoots(denNode);
  const dy = math.derivative(math.parse(`(${numNode.toString()}) / (${denNode.toString()})`), "x");
  const dySimplified = math.simplify(dy);
  const derivLatex = dySimplified.toTex();
  const dyEval = dySimplified.compile();
  const dR = (x) => {
    try {
      const val = dyEval.evaluate({ x });
      return typeof val === "number" && !isNaN(val) ? val : NaN;
    } catch {
      return NaN;
    }
  };
  const rawCriticals = findRoots(dySimplified);
  const filteredCriticals = rawCriticals.filter((c) => !poles.some((p) => Math.abs(p - c) < 1e-3)).filter((c) => {
    const dLeft = dR(c - 1e-4);
    const dRight = dR(c + 1e-4);
    return dLeft * dRight < -1e-10;
  }).sort((a, b) => a - b);
  const x_points = [];
  x_points.push({ id: "x-0", latex: "-\\infty", type: "infinity", value: -Infinity });
  let pointCounter = 1;
  const sortedMilestones = [
    ...poles.map((p) => ({ val: p, type: "discontinuity" })),
    ...filteredCriticals.map((c) => ({ val: c, type: "critical" }))
  ].sort((a, b) => a.val - b.val);
  sortedMilestones.forEach((m) => {
    const exactLatex = toExactLatex(m.val);
    const parsedVal = parseLatexToVal(exactLatex);
    x_points.push({
      id: `x-${pointCounter++}`,
      latex: exactLatex,
      type: m.type,
      value: parsedVal !== null ? parsedVal : m.val
    });
  });
  x_points.push({ id: `x-${pointCounter}`, latex: "+\\infty", type: "infinity", value: Infinity });
  const N = x_points.length;
  const y_prime_points = [];
  const y_prime_intervals = [];
  x_points.forEach((p) => {
    if (p.type === "infinity") {
      y_prime_points.push("");
    } else if (p.type === "discontinuity") {
      y_prime_points.push("d");
    } else {
      y_prime_points.push("0");
    }
  });
  for (let i = 0; i < N - 1; i++) {
    const left = x_points[i].value;
    const right = x_points[i + 1].value;
    const xMid = left === -Infinity && right === Infinity ? 0 : left === -Infinity ? right - 1.5 : right === Infinity ? left + 1.5 : (left + right) / 2;
    const dVal = dR(xMid);
    if (isNaN(dVal)) {
      y_prime_intervals.push("h");
    } else {
      y_prime_intervals.push(dVal > 1e-7 ? "+" : dVal < -1e-7 ? "-" : "+");
    }
  }
  const y_points_vals = [];
  x_points.forEach((p, idx) => {
    if (p.type === "infinity") {
      const testVal = p.value === -Infinity ? -1e5 : 1e5;
      const limitVal = evalY(testVal);
      if (!isNaN(limitVal) && isFinite(limitVal) && Math.abs(limitVal) < 1e3) {
        const limitLatex = toExactLatex(limitVal);
        let position = "middle";
        if (idx === 0) {
          position = y_prime_intervals[0] === "+" ? "bottom" : "top";
        } else {
          position = y_prime_intervals[y_prime_intervals.length - 1] === "+" ? "top" : "bottom";
        }
        y_points_vals.push({ type: "single", latex: limitLatex, position });
      } else {
        const limitLatex = limitVal > 0 ? "+\\infty" : "-\\infty";
        const position = limitVal > 0 ? "top" : "bottom";
        y_points_vals.push({ type: "single", latex: limitLatex, position });
      }
    } else if (p.type === "discontinuity") {
      const poleVal = p.value;
      const leftY = evalY(poleVal - 1e-5);
      const rightY = evalY(poleVal + 1e-5);
      const latexLeft = leftY > 1e3 || isNaN(leftY) ? "+\\infty" : leftY < -1e3 ? "-\\infty" : toExactLatex(leftY);
      const latexRight = rightY > 1e3 || isNaN(rightY) ? "+\\infty" : rightY < -1e3 ? "-\\infty" : toExactLatex(rightY);
      const positionLeft = latexLeft.includes("-\\infty") ? "bottom" : latexLeft.includes("+\\infty") ? "top" : "middle";
      const positionRight = latexRight.includes("-\\infty") ? "bottom" : latexRight.includes("+\\infty") ? "top" : "middle";
      y_points_vals.push({ type: "discontinuity", latexLeft, positionLeft, latexRight, positionRight });
    } else {
      const critVal = p.value;
      const val = evalY(critVal);
      const leftSign = y_prime_intervals[idx - 1];
      const rightSign = y_prime_intervals[idx];
      let position = "middle";
      if (leftSign === "+" && rightSign === "-") {
        position = "top";
      } else if (leftSign === "-" && rightSign === "+") {
        position = "bottom";
      }
      y_points_vals.push({ type: "single", latex: toExactLatex(val), position });
    }
  });
  const y_row = { points: y_points_vals };
  const espcl = Math.max(1.5, parseFloat((8 / (N - 1)).toFixed(1)));
  const xList = x_points.map((p) => `$${p.latex}$`).join(", ");
  const yPrimeLineParts = [];
  for (let i = 0; i < N; i++) {
    if (i === 0) {
      yPrimeLineParts.push("");
    } else {
      yPrimeLineParts.push(y_prime_intervals[i - 1]);
    }
    if (x_points[i].type === "discontinuity") {
      yPrimeLineParts.push("d");
    } else if (x_points[i].type === "critical") {
      yPrimeLineParts.push("z");
    } else if (i > 0 && i < N - 1) {
      yPrimeLineParts.push("");
    }
  }
  yPrimeLineParts.push("");
  const yPrimeLine = yPrimeLineParts.join(", ");
  const yVarParts = [];
  y_points_vals.forEach((yv, i) => {
    if (yv.type === "single") {
      const sign = yv.position === "top" ? "+" : "-";
      yVarParts.push(`${sign}/ $${yv.latex}$`);
    } else {
      const leftSign = yv.positionLeft === "top" ? "+" : "-";
      const rightSign = yv.positionRight === "top" ? "+" : "-";
      yVarParts.push(`${leftSign}D${rightSign}/ $${yv.latexLeft}$ / $${yv.latexRight}$`);
    }
  });
  const yVarLine = yVarParts.join(", ");
  const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=${espcl}]
  {$x$ / 1, $y'$ / 1, $y$ / 2.5}
  {${xList}}
\\tkzTabLine{${yPrimeLine}}
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;
  const explanation_steps = [];
  let txdLatex = "D = \\mathbb{R}";
  let txdContent = "T\u1EADp x\xE1c \u0111\u1ECBnh c\u1EE7a h\xE0m s\u1ED1: $D = \\mathbb{R}$.";
  if (poles.length > 0) {
    const poleLatexList = poles.map((p) => toExactLatex(p)).join("; ");
    txdLatex = `D = \\mathbb{R} \\setminus \\{${poleLatexList}\\}`;
    txdContent = `T\u1EADp x\xE1c \u0111\u1ECBnh c\u1EE7a h\xE0m s\u1ED1: $D = \\mathbb{R} \\setminus \\{${poleLatexList}\\}$.`;
  }
  explanation_steps.push({ title: "B\u01B0\u1EDBc 1. T\u1EADp x\xE1c \u0111\u1ECBnh", content: txdContent });
  let derivativeExplanation = `Ta c\xF3 \u0111\u1EA1o h\xE0m $y' = ${derivLatex}$.
`;
  if (filteredCriticals.length > 0) {
    const rootEqs = filteredCriticals.map((c) => `x = ${toExactLatex(c)}`).join(" ho\u1EB7c ");
    derivativeExplanation += `Cho $y' = 0 \\Leftrightarrow x = ${rootEqs}$.`;
  } else {
    derivativeExplanation += `Ta th\u1EA5y ph\u01B0\u01A1ng tr\xECnh $y' = 0$ v\xF4 nghi\u1EC7m tr\xEAn t\u1EADp x\xE1c \u0111\u1ECBnh. \u0110\u1EA1o h\xE0m $y'$ kh\xF4ng \u0111\u1ED5i d\u1EA5u.`;
  }
  explanation_steps.push({ title: "B\u01B0\u1EDBc 2: T\xEDnh \u0111\u1EA1o h\xE0m y' v\xE0 t\xECm c\xE1c \u0111i\u1EC3m t\u1EDBi h\u1EA1n", content: derivativeExplanation });
  let limitExplanation = `T\xEDnh gi\u1EDBi h\u1EA1n t\u1EA1i c\xE1c \u0111i\u1EC3m gi\xE1n \u0111o\u1EA1n v\xE0 v\xF4 c\u1EF1c:
`;
  if (poles.length > 0) {
    limitExplanation += `* Ti\u1EC7m c\u1EADn \u0111\u1EE9ng: `;
    poles.forEach((p) => {
      const pL = toExactLatex(p);
      limitExplanation += `$x = ${pL}$ l\xE0 \u0111\u01B0\u1EDDng ti\u1EC7m c\u1EADn \u0111\u1EE9ng v\xEC $\\lim_{x \\to ${pL}^\\pm} y = \\pm\\infty$.
`;
    });
  }
  const limPos = evalY(1e5);
  const limNeg = evalY(-1e5);
  if (!isNaN(limPos) && isFinite(limPos) && Math.abs(limPos) < 1e3 && Math.abs(limPos - limNeg) < 0.01) {
    const haL = toExactLatex(limPos);
    limitExplanation += `* Ti\u1EC7m c\u1EADn ngang: $y = ${haL}$ v\xEC $\\lim_{x \\to \\pm\\infty} y = ${haL}$.
`;
  } else {
    const aVal = evalY(1e5) / 1e5;
    if (!isNaN(aVal) && isFinite(aVal) && Math.abs(aVal) > 1e-4) {
      const bVal = evalY(1e5) - aVal * 1e5;
      if (!isNaN(bVal) && isFinite(bVal)) {
        const slantL = formatPolyLatex([aVal, bVal], [1, 0]);
        limitExplanation += `* Ti\u1EC7m c\u1EADn xi\xEAn: $y = ${slantL}$ v\xEC $\\lim_{x \\to \\pm\\infty} [y - (${slantL})] = 0$.
`;
      }
    }
  }
  explanation_steps.push({ title: "B\u01B0\u1EDBc 3: T\xEDnh c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB, gi\u1EDBi h\u1EA1n, ti\u1EC7m c\u1EADn", content: limitExplanation.trim() });
  let bbtExplanation = `D\u1EF1a v\xE0o b\u1EA3ng bi\u1EBFn thi\xEAn, ta k\u1EBFt lu\u1EADn c\xE1c t\xEDnh ch\u1EA5t c\u1EE7a h\xE0m s\u1ED1:
`;
  y_prime_intervals.forEach((sign, i) => {
    const leftX = x_points[i].latex;
    const rightX = x_points[i + 1].latex;
    bbtExplanation += `* H\xE0m s\u1ED1 **${sign === "+" ? "\u0111\u1ED3ng bi\u1EBFn" : "ngh\u1ECBch bi\u1EBFn"}** tr\xEAn kho\u1EA3ng $(${leftX}; ${rightX})$.
`;
  });
  const cMax = y_points_vals.filter((yv) => yv.type === "single" && yv.position === "top");
  const cMin = y_points_vals.filter((yv) => yv.type === "single" && yv.position === "bottom");
  if (cMax.length > 0) {
    bbtExplanation += `* H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c \u0111\u1EA1i** t\u1EA1i c\xE1c \u0111i\u1EC3m c\u1EF1c \u0111\u1EA1i.
`;
  }
  if (cMin.length > 0) {
    bbtExplanation += `* H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c ti\u1EC3u** t\u1EA1i c\xE1c \u0111i\u1EC3m c\u1EF1c ti\u1EC3u.
`;
  }
  explanation_steps.push({ title: "B\u01B0\u1EDBc 4: B\u1EA3ng bi\u1EBFn thi\xEAn v\xE0 k\u1EBFt lu\u1EADn", content: bbtExplanation.trim() });
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
function analyzeDeterministic(classification, functionStr, functionLatex, node) {
  const { type, coeffs, numNode, denNode } = classification;
  if (type === "rational_generic" && numNode && denNode) {
    return solveRationalGeneric(numNode, denNode, functionStr, functionLatex);
  }
  if (type === "constant") {
    const c = coeffs[0];
    const cLatex = toExactLatex(c);
    const x_points = [
      { id: "x-0", latex: "-\\infty", type: "infinity", value: -Infinity },
      { id: "x-1", latex: "+\\infty", type: "infinity", value: Infinity }
    ];
    const y_prime = {
      points: ["", ""],
      intervals: ["h"]
    };
    const y_row = {
      points: [
        { type: "single", latex: cLatex, position: "middle" },
        { type: "single", latex: cLatex, position: "middle" }
      ]
    };
    const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=4.0]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\infty$, $+\\infty$}
\\tkzTabLine{, , }
\\tkzTabVar{-/ $${cLatex}$, +/ $${cLatex}$}
\\end{tikzpicture}`;
    const explanation_steps = [
      {
        title: "B\u01B0\u1EDBc 1. T\u1EADp x\xE1c \u0111\u1ECBnh",
        content: "T\u1EADp x\xE1c \u0111\u1ECBnh c\u1EE7a h\xE0m s\u1ED1: $D = \\mathbb{R}$."
      },
      {
        title: "B\u01B0\u1EDBc 2: T\xEDnh \u0111\u1EA1o h\xE0m y' v\xE0 t\xECm c\xE1c \u0111i\u1EC3m t\u1EDBi h\u1EA1n",
        content: "Ta c\xF3 \u0111\u1EA1o h\xE0m $y' = 0$. H\xE0m s\u1ED1 l\xE0 h\xE0m h\u1EB1ng (kh\xF4ng bi\u1EBFn thi\xEAn)."
      },
      {
        title: "B\u01B0\u1EDBc 3: T\xEDnh c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB, gi\u1EDBi h\u1EA1n, ti\u1EC7m c\u1EADn",
        content: `Gi\u1EDBi h\u1EA1n t\u1EA1i v\xF4 c\u1EF1c: $\\lim_{x \\to -\\infty} y = ${cLatex}$ v\xE0 $\\lim_{x \\to +\\infty} y = ${cLatex}$.
H\xE0m s\u1ED1 kh\xF4ng c\xF3 ti\u1EC7m c\u1EADn \u0111\u1EE9ng v\xE0 ti\u1EC7m c\u1EADn ngang.`
      },
      {
        title: "B\u01B0\u1EDBc 4: B\u1EA3ng bi\u1EBFn thi\xEAn v\xE0 k\u1EBFt lu\u1EADn",
        content: "H\xE0m s\u1ED1 kh\xF4ng \u0111\u1ED5i (h\u1EB1ng s\u1ED1) tr\xEAn to\xE0n b\u1ED9 mi\u1EC1n x\xE1c \u0111\u1ECBnh v\xE0 kh\xF4ng c\xF3 c\u1EF1c tr\u1ECB."
      }
    ];
    return { functionStr, functionLatex, txd: "D = \\mathbb{R}", derivative: "0", x_points, y_prime, y_row, latex_code, explanation_steps };
  }
  if (type === "linear") {
    const [a, b] = coeffs;
    const aLatex = toExactLatex(a);
    const exprLatex = formatPolyLatex([a, b], [1, 0]);
    const x_points = [
      { id: "x-0", latex: "-\\infty", type: "infinity", value: -Infinity },
      { id: "x-1", latex: "+\\infty", type: "infinity", value: Infinity }
    ];
    const y_prime = {
      points: ["", ""],
      intervals: [a > 0 ? "+" : "-"]
    };
    const y_row = {
      points: [
        { type: "single", latex: a > 0 ? "-\\infty" : "+\\infty", position: a > 0 ? "bottom" : "top" },
        { type: "single", latex: a > 0 ? "+\\infty" : "-\\infty", position: a > 0 ? "top" : "bottom" }
      ]
    };
    const yVarLine = a > 0 ? `- / $-\\infty$, + / $+\\infty$` : `+ / $+\\infty$, - / $-\\infty$`;
    const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=4.0]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\infty$, $+\\infty$}
\\tkzTabLine{, ${a > 0 ? "+" : "-"}, }
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;
    const explanation_steps = [
      {
        title: "B\u01B0\u1EDBc 1. T\u1EADp x\xE1c \u0111\u1ECBnh",
        content: "T\u1EADp x\xE1c \u0111\u1ECBnh: $D = \\mathbb{R}$."
      },
      {
        title: "B\u01B0\u1EDBc 2: T\xEDnh \u0111\u1EA1o h\xE0m y' v\xE0 t\xECm c\xE1c \u0111i\u1EC3m t\u1EDBi h\u1EA1n",
        content: `Ta c\xF3 \u0111\u1EA1o h\xE0m $y' = ${aLatex}$. V\xEC $y' = ${aLatex} \\neq 0$ v\u1EDBi m\u1ECDi $x \\in \\mathbb{R}$ n\xEAn h\xE0m s\u1ED1 kh\xF4ng c\xF3 \u0111i\u1EC3m t\u1EDBi h\u1EA1n.`
      },
      {
        title: "B\u01B0\u1EDBc 3: T\xEDnh c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB, gi\u1EDBi h\u1EA1n, ti\u1EC7m c\u1EADn",
        content: a > 0 ? `* Gi\u1EDBi h\u1EA1n t\u1EA1i \xE2m v\xF4 c\u1EF1c: $\\lim_{x \\to -\\infty} y = -\\infty$
* Gi\u1EDBi h\u1EA1n t\u1EA1i d\u01B0\u01A1ng v\xF4 c\u1EF1c: $\\lim_{x \\to +\\infty} y = +\\infty$` : `* Gi\u1EDBi h\u1EA1n t\u1EA1i \xE2m v\xF4 c\u1EF1c: $\\lim_{x \\to -\\infty} y = +\\infty$
* Gi\u1EDBi h\u1EA1n t\u1EA1i d\u01B0\u01A1ng v\xF4 c\u1EF1c: $\\lim_{x \\to +\\infty} y = -\\infty$`
      },
      {
        title: "B\u01B0\u1EDBc 4: B\u1EA3ng bi\u1EBFn thi\xEAn v\xE0 k\u1EBFt lu\u1EADn",
        content: `H\xE0m s\u1ED1 **${a > 0 ? "\u0111\u1ED3ng bi\u1EBFn" : "ngh\u1ECBch bi\u1EBFn"}** tr\xEAn kho\u1EA3ng $(-\\infty; +\\infty)$. H\xE0m s\u1ED1 kh\xF4ng c\xF3 c\u1EF1c tr\u1ECB.`
      }
    ];
    return { functionStr, functionLatex: exprLatex, txd: "D = \\mathbb{R}", derivative: aLatex, x_points, y_prime, y_row, latex_code, explanation_steps };
  }
  if (type === "quadratic") {
    const [a, b, c] = coeffs;
    const aLatex = toExactLatex(a);
    const bLatex = toExactLatex(b);
    const exprLatex = formatPolyLatex([a, b, c], [2, 1, 0]);
    const derivLatex = formatPolyLatex([2 * a, b], [1, 0]);
    const x0 = -b / (2 * a);
    const y0 = a * x0 * x0 + b * x0 + c;
    const x0Latex = toExactLatex(x0);
    const y0Latex = toExactLatex(y0);
    const x_points = [
      { id: "x-0", latex: "-\\infty", type: "infinity", value: -Infinity },
      { id: "x-1", latex: x0Latex, type: "critical", value: x0 },
      { id: "x-2", latex: "+\\infty", type: "infinity", value: Infinity }
    ];
    const y_prime = {
      points: ["", "0", ""],
      intervals: a > 0 ? ["-", "+"] : ["+", "-"]
    };
    const y_row = {
      points: [
        { type: "single", latex: a > 0 ? "+\\infty" : "-\\infty", position: a > 0 ? "top" : "bottom" },
        { type: "single", latex: y0Latex, position: a > 0 ? "bottom" : "top" },
        { type: "single", latex: a > 0 ? "+\\infty" : "-\\infty", position: a > 0 ? "top" : "bottom" }
      ]
    };
    const yVarLine = a > 0 ? `+/ $+\\infty$, -/ $${y0Latex}$, +/ $+\\infty$` : `-/ $-\\infty$, +/ $${y0Latex}$, -/ $-\\infty$`;
    const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=2.5]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\infty$, $${x0Latex}$, $+\\infty$}
\\tkzTabLine{, ${a > 0 ? "-" : "+"}, z, ${a > 0 ? "+" : "-"}, }
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;
    const limQuadratic = a > 0 ? "+\\infty" : "-\\infty";
    const explanation_steps = [
      {
        title: "B\u01B0\u1EDBc 1. T\u1EADp x\xE1c \u0111\u1ECBnh",
        content: "T\u1EADp x\xE1c \u0111\u1ECBnh: $D = \\mathbb{R}$."
      },
      {
        title: "B\u01B0\u1EDBc 2: T\xEDnh \u0111\u1EA1o h\xE0m y' v\xE0 t\xECm c\xE1c \u0111i\u1EC3m t\u1EDBi h\u1EA1n",
        content: `Ta c\xF3 \u0111\u1EA1o h\xE0m $y' = ${derivLatex}$.
Cho $y' = 0 \\Leftrightarrow ${derivLatex} = 0 \\Leftrightarrow x = ${x0Latex}$.`
      },
      {
        title: "B\u01B0\u1EDBc 3: T\xEDnh c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB, gi\u1EDBi h\u1EA1n, ti\u1EC7m c\u1EADn",
        content: `* Gi\u1EDBi h\u1EA1n: $\\lim_{x \\to \\pm\\infty} y = ${limQuadratic}$.
* C\u1EF1c tr\u1ECB: T\u1EA1i $x = ${x0Latex}$, h\xE0m s\u1ED1 \u0111\u1EA1t gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB $y = ${y0Latex}$.`
      },
      {
        title: "B\u01B0\u1EDBc 4: B\u1EA3ng bi\u1EBFn thi\xEAn v\xE0 k\u1EBFt lu\u1EADn",
        content: a > 0 ? `H\xE0m s\u1ED1 ngh\u1ECBch bi\u1EBFn tr\xEAn kho\u1EA3ng $(-\\infty; ${x0Latex})$ v\xE0 \u0111\u1ED3ng bi\u1EBFn tr\xEAn kho\u1EA3ng $(${x0Latex}; +\\infty)$.
H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c ti\u1EC3u** t\u1EA1i $x = ${x0Latex}$, gi\xE1 tr\u1ECB c\u1EF1c ti\u1EC3u $y_{CT} = ${y0Latex}$.` : `H\xE0m s\u1ED1 \u0111\u1ED3ng bi\u1EBFn tr\xEAn kho\u1EA3ng $(-\\infty; ${x0Latex})$ v\xE0 ngh\u1ECBch bi\u1EBFn tr\xEAn kho\u1EA3ng $(${x0Latex}; +\\infty)$.
H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c \u0111\u1EA1i** t\u1EA1i $x = ${x0Latex}$, gi\xE1 tr\u1ECB c\u1EF1c \u0111\u1EA1i $y_{C\u0110} = ${y0Latex}$.`
      }
    ];
    return { functionStr, functionLatex: exprLatex, txd: "D = \\mathbb{R}", derivative: derivLatex, x_points, y_prime, y_row, latex_code, explanation_steps };
  }
  if (type === "cubic") {
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
      const x_points = [
        { id: "x-0", latex: "-\\infty", type: "infinity", value: -Infinity },
        { id: "x-1", latex: r1Latex, type: "critical", value: r1 },
        { id: "x-2", latex: r2Latex, type: "critical", value: r2 },
        { id: "x-3", latex: "+\\infty", type: "infinity", value: Infinity }
      ];
      const y_prime = {
        points: ["", "0", "0", ""],
        intervals: a > 0 ? ["+", "-", "+"] : ["-", "+", "-"]
      };
      const pos1 = a > 0 ? "top" : "bottom";
      const pos2 = a > 0 ? "bottom" : "top";
      const y_row = {
        points: [
          { type: "single", latex: a > 0 ? "-\\infty" : "+\\infty", position: a > 0 ? "bottom" : "top" },
          { type: "single", latex: y1Latex, position: pos1 },
          { type: "single", latex: y2Latex, position: pos2 },
          { type: "single", latex: a > 0 ? "+\\infty" : "-\\infty", position: a > 0 ? "top" : "bottom" }
        ]
      };
      const yVarLine = a > 0 ? `- / $-\\infty$, +/ $${y1Latex}$, -/ $${y2Latex}$, +/ $+\\infty$` : `+/ $+\\infty$, -/ $${y1Latex}$, +/ $${y2Latex}$, -/ $-\\infty$`;
      const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=2.0]
  {$x$ / 1, $y'$ / 1, $y$ / 2.5}
  {$-\\infty$, $${r1Latex}$, $${r2Latex}$, $+\\infty$}
\\tkzTabLine{, ${a > 0 ? "+" : "-"}, z, ${a > 0 ? "-" : "+"}, z, ${a > 0 ? "+" : "-"}, }
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;
      const limNeg = a > 0 ? "-\\infty" : "+\\infty";
      const limPos = a > 0 ? "+\\infty" : "-\\infty";
      const explanation_steps = [
        {
          title: "B\u01B0\u1EDBc 1. T\u1EADp x\xE1c \u0111\u1ECBnh",
          content: "T\u1EADp x\xE1c \u0111\u1ECBnh: $D = \\mathbb{R}$."
        },
        {
          title: "B\u01B0\u1EDBc 2: T\xEDnh \u0111\u1EA1o h\xE0m y' v\xE0 t\xECm c\xE1c \u0111i\u1EC3m t\u1EDBi h\u1EA1n",
          content: `Ta c\xF3 \u0111\u1EA1o h\xE0m $y' = ${derivLatex}$.
Cho $y' = 0 \\Leftrightarrow ${derivLatex} = 0 \\Leftrightarrow x = ${r1Latex}$ ho\u1EB7c $x = ${r2Latex}$.`
        },
        {
          title: "B\u01B0\u1EDBc 3: T\xEDnh c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB, gi\u1EDBi h\u1EA1n, ti\u1EC7m c\u1EADn",
          content: `* Gi\u1EDBi h\u1EA1n: $\\lim_{x \\to -\\infty} y = ${limNeg}$ v\xE0 $\\lim_{x \\to +\\infty} y = ${limPos}$.
* C\u1EF1c tr\u1ECB: H\xE0m s\u1ED1 \u0111\u1EA1t c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB: $y(${r1Latex}) = ${y1Latex}$ v\xE0 $y(${r2Latex}) = ${y2Latex}$.`
        },
        {
          title: "B\u01B0\u1EDBc 4: B\u1EA3ng bi\u1EBFn thi\xEAn v\xE0 k\u1EBFt lu\u1EADn",
          content: a > 0 ? `H\xE0m s\u1ED1 \u0111\u1ED3ng bi\u1EBFn tr\xEAn c\xE1c kho\u1EA3ng $(-\\infty; ${r1Latex})$ v\xE0 $(${r2Latex}; +\\infty)$, ngh\u1ECBch bi\u1EBFn tr\xEAn kho\u1EA3ng $(${r1Latex}; ${r2Latex})$.
* H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c \u0111\u1EA1i** t\u1EA1i $x = ${r1Latex}$, gi\xE1 tr\u1ECB c\u1EF1c \u0111\u1EA1i $y_{C\u0110} = ${y1Latex}$.
* H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c ti\u1EC3u** t\u1EA1i $x = ${r2Latex}$, gi\xE1 tr\u1ECB c\u1EF1c ti\u1EC3u $y_{CT} = ${y2Latex}$.` : `H\xE0m s\u1ED1 ngh\u1ECBch bi\u1EBFn tr\xEAn c\xE1c kho\u1EA3ng $(-\\infty; ${r1Latex})$ v\xE0 $(${r2Latex}; +\\infty)$, \u0111\u1ED3ng bi\u1EBFn tr\xEAn kho\u1EA3ng $(${r1Latex}; ${r2Latex})$.
* H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c ti\u1EC3u** t\u1EA1i $x = ${r1Latex}$, gi\xE1 tr\u1ECB c\u1EF1c ti\u1EC3u $y_{CT} = ${y1Latex}$.
* H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c \u0111\u1EA1i** t\u1EA1i $x = ${r2Latex}$, gi\xE1 tr\u1ECB c\u1EF1c \u0111\u1EA1i $y_{C\u0110} = ${y2Latex}$.`
        }
      ];
      return { functionStr, functionLatex: exprLatex, txd: "D = \\mathbb{R}", derivative: derivLatex, x_points, y_prime, y_row, latex_code, explanation_steps };
    } else {
      const x_points = [
        { id: "x-0", latex: "-\\infty", type: "infinity", value: -Infinity },
        { id: "x-1", latex: "+\\infty", type: "infinity", value: Infinity }
      ];
      const y_prime = {
        points: ["", ""],
        intervals: [a > 0 ? "+" : "-"]
      };
      const y_row = {
        points: [
          { type: "single", latex: a > 0 ? "-\\infty" : "+\\infty", position: a > 0 ? "bottom" : "top" },
          { type: "single", latex: a > 0 ? "+\\infty" : "-\\infty", position: a > 0 ? "top" : "bottom" }
        ]
      };
      const yVarLine = a > 0 ? `- / $-\\infty$, + / $+\\infty$` : `+ / $+\\infty$, - / $-\\infty$`;
      const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=4.0]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\infty$, $+\\infty$}
\\tkzTabLine{, ${a > 0 ? "+" : "-"}, }
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;
      const signLatex = a > 0 ? "\\ge 0" : "\\le 0";
      const limNeg = a > 0 ? "-\\infty" : "+\\infty";
      const limPos = a > 0 ? "+\\infty" : "-\\infty";
      const explanation_steps = [
        {
          title: "B\u01B0\u1EDBc 1. T\u1EADp x\xE1c \u0111\u1ECBnh",
          content: "T\u1EADp x\xE1c \u0111\u1ECBnh: $D = \\mathbb{R}$."
        },
        {
          title: "B\u01B0\u1EDBc 2: T\xEDnh \u0111\u1EA1o h\xE0m y' v\xE0 t\xECm c\xE1c \u0111i\u1EC3m t\u1EDBi h\u1EA1n",
          content: `Ta c\xF3 \u0111\u1EA1o h\xE0m $y' = ${derivLatex}$.
V\xEC $\\Delta' \\le 0$, ph\u01B0\u01A1ng tr\xECnh $y' = 0$ v\xF4 nghi\u1EC7m ho\u1EB7c c\xF3 nghi\u1EC7m k\xE9p, do \u0111\xF3 $y'$ lu\xF4n c\xF9ng d\u1EA5u v\u1EDBi h\u1EC7 s\u1ED1 $a$ (t\u1EE9c l\xE0 $y' ${signLatex}$ v\u1EDBi m\u1ECDi $x \\in \\mathbb{R}$). H\xE0m s\u1ED1 kh\xF4ng c\xF3 c\u1EF1c tr\u1ECB.`
        },
        {
          title: "B\u01B0\u1EDBc 3: T\xEDnh c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB, gi\u1EDBi h\u1EA1n, ti\u1EC7m c\u1EADn",
          content: `Gi\u1EDBi h\u1EA1n t\u1EA1i v\xF4 c\u1EF1c: $\\lim_{x \\to -\\infty} y = ${limNeg}$ v\xE0 $\\lim_{x \\to +\\infty} y = ${limPos}$.`
        },
        {
          title: "B\u01B0\u1EDBc 4: B\u1EA3ng bi\u1EBFn thi\xEAn v\xE0 k\u1EBFt lu\u1EADn",
          content: `H\xE0m s\u1ED1 lu\xF4n **${a > 0 ? "\u0111\u1ED3ng bi\u1EBFn" : "ngh\u1ECBch bi\u1EBFn"}** tr\xEAn $(-\\infty; +\\infty)$ v\xE0 kh\xF4ng c\xF3 c\u1EF1c tr\u1ECB.`
        }
      ];
      return { functionStr, functionLatex: exprLatex, txd: "D = \\mathbb{R}", derivative: derivLatex, x_points, y_prime, y_row, latex_code, explanation_steps };
    }
  }
  if (type === "quartic") {
    const [a, b, c] = coeffs;
    const exprLatex = formatPolyLatex([a, b, c], [4, 2, 0]);
    const derivLatex = formatPolyLatex([4 * a, 2 * b], [3, 1]);
    const root2_val = -b / (2 * a);
    if (root2_val > 1e-5) {
      const r_val = Math.sqrt(root2_val);
      const rLow = -r_val;
      const rHigh = r_val;
      const yMin = a * Math.pow(r_val, 4) + b * Math.pow(r_val, 2) + c;
      const rLowLatex = `-\\sqrt{${toExactLatex(root2_val).replace("-", "")}}`;
      const rHighLatex = `\\sqrt{${toExactLatex(root2_val).replace("-", "")}}`;
      const yMinLatex = toExactLatex(yMin);
      const cLatex = toExactLatex(c);
      const x_points = [
        { id: "x-0", latex: "-\\infty", type: "infinity", value: -Infinity },
        { id: "x-1", latex: rLowLatex, type: "critical", value: rLow },
        { id: "x-2", latex: "0", type: "critical", value: 0 },
        { id: "x-3", latex: rHighLatex, type: "critical", value: rHigh },
        { id: "x-4", latex: "+\\infty", type: "infinity", value: Infinity }
      ];
      const y_prime = {
        points: ["", "0", "0", "0", ""],
        intervals: a > 0 ? ["-", "+", "-", "+"] : ["+", "-", "+", "-"]
      };
      const y_row = {
        points: [
          { type: "single", latex: a > 0 ? "+\\infty" : "-\\infty", position: a > 0 ? "top" : "bottom" },
          { type: "single", latex: yMinLatex, position: a > 0 ? "bottom" : "top" },
          { type: "single", latex: cLatex, position: a > 0 ? "top" : "bottom" },
          { type: "single", latex: yMinLatex, position: a > 0 ? "bottom" : "top" },
          { type: "single", latex: a > 0 ? "+\\infty" : "-\\infty", position: a > 0 ? "top" : "bottom" }
        ]
      };
      const yVarLine = a > 0 ? `+/ $+\\infty$, -/ $${yMinLatex}$, +/ $${cLatex}$, -/ $${yMinLatex}$, +/ $+\\infty$` : `-/ $-\\infty$, +/ $${yMinLatex}$, -/ $${cLatex}$, +/ $${yMinLatex}$, -/ $-\\infty$`;
      const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=1.8]
  {$x$ / 1, $y'$ / 1, $y$ / 2.5}
  {$-\\infty$, $${rLowLatex}$, $0$, $${rHighLatex}$, $+\\infty$}
\\tkzTabLine{, ${a > 0 ? "-" : "+"}, z, ${a > 0 ? "+" : "-"}, z, ${a > 0 ? "-" : "+"}, z, ${a > 0 ? "+" : "-"}, }
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;
      const limQuartic = a > 0 ? "+\\infty" : "-\\infty";
      const explanation_steps = [
        {
          title: "B\u01B0\u1EDBc 1. T\u1EADp x\xE1c \u0111\u1ECBnh",
          content: "T\u1EADp x\xE1c \u0111\u1ECBnh: $D = \\mathbb{R}$."
        },
        {
          title: "B\u01B0\u1EDBc 2: T\xEDnh \u0111\u1EA1o h\xE0m y' v\xE0 t\xECm c\xE1c \u0111i\u1EC3m t\u1EDBi h\u1EA1n",
          content: `Ta c\xF3 \u0111\u1EA1o h\xE0m $y' = ${derivLatex} = 2x(2ax^2 + b)$.
Cho $y' = 0 \\Leftrightarrow x = 0$ ho\u1EB7c $x = ${rLowLatex}$ ho\u1EB7c $x = ${rHighLatex}$.`
        },
        {
          title: "B\u01B0\u1EDBc 3: T\xEDnh c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB, gi\u1EDBi h\u1EA1n, ti\u1EC7m c\u1EADn",
          content: `* Gi\u1EDBi h\u1EA1n: $\\lim_{x \\to \\pm\\infty} y = ${limQuartic}$.
* C\u1EF1c tr\u1ECB: C\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB l\xE0 $y(0) = ${cLatex}$ v\xE0 $y(${rLowLatex}) = y(${rHighLatex}) = ${yMinLatex}$.`
        },
        {
          title: "B\u01B0\u1EDBc 4: B\u1EA3ng bi\u1EBFn thi\xEAn v\xE0 k\u1EBFt lu\u1EADn",
          content: a > 0 ? `H\xE0m s\u1ED1 ngh\u1ECBch bi\u1EBFn tr\xEAn c\xE1c kho\u1EA3ng $(-\\infty; ${rLowLatex})$ v\xE0 $(0; ${rHighLatex})$, \u0111\u1ED3ng bi\u1EBFn tr\xEAn c\xE1c kho\u1EA3ng $(${rLowLatex}; 0)$ v\xE0 $(${rHighLatex}; +\\infty)$.
* H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c \u0111\u1EA1i** t\u1EA1i $x = 0$, gi\xE1 tr\u1ECB c\u1EF1c \u0111\u1EA1i $y_{C\u0110} = ${cLatex}$.
* H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c ti\u1EC3u** t\u1EA1i hai \u0111i\u1EC3m $x = \\pm ${rHighLatex}$, gi\xE1 tr\u1ECB c\u1EF1c ti\u1EC3u $y_{CT} = ${yMinLatex}$.` : `H\xE0m s\u1ED1 \u0111\u1ED3ng bi\u1EBFn tr\xEAn c\xE1c kho\u1EA3ng $(-\\infty; ${rLowLatex})$ v\xE0 $(0; ${rHighLatex})$, ngh\u1ECBch bi\u1EBFn tr\xEAn c\xE1c kho\u1EA3ng $(${rLowLatex}; 0)$ v\xE0 $(${rHighLatex}; +\\infty)$.
* H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c ti\u1EC3u** t\u1EA1i $x = 0$, gi\xE1 tr\u1ECB c\u1EF1c ti\u1EC3u $y_{CT} = ${cLatex}$.
* H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c \u0111\u1EA1i** t\u1EA1i hai \u0111i\u1EC3m $x = \\pm ${rHighLatex}$, gi\xE1 tr\u1ECB \u0111\u1EA1i $y_{C\u0110} = ${yMinLatex}$.`
        }
      ];
      return { functionStr, functionLatex: exprLatex, txd: "D = \\mathbb{R}", derivative: derivLatex, x_points, y_prime, y_row, latex_code, explanation_steps };
    } else {
      const cLatex = toExactLatex(c);
      const x_points = [
        { id: "x-0", latex: "-\\infty", type: "infinity", value: -Infinity },
        { id: "x-1", latex: "0", type: "critical", value: 0 },
        { id: "x-2", latex: "+\\infty", type: "infinity", value: Infinity }
      ];
      const y_prime = {
        points: ["", "0", ""],
        intervals: a > 0 ? ["-", "+"] : ["+", "-"]
      };
      const y_row = {
        points: [
          { type: "single", latex: a > 0 ? "+\\infty" : "-\\infty", position: a > 0 ? "top" : "bottom" },
          { type: "single", latex: cLatex, position: a > 0 ? "bottom" : "top" },
          { type: "single", latex: a > 0 ? "+\\infty" : "-\\infty", position: a > 0 ? "top" : "bottom" }
        ]
      };
      const yVarLine = a > 0 ? `+/ $+\\infty$, -/ $${cLatex}$, +/ $+\\infty$` : `-/ $-\\infty$, +/ $${cLatex}$, -/ $-\\infty$`;
      const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=3.0]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\infty$, $0$, $+\\infty$}
\\tkzTabLine{, ${a > 0 ? "-" : "+"}, z, ${a > 0 ? "+" : "-"}, }
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;
      const limQuartic = a > 0 ? "+\\infty" : "-\\infty";
      const explanation_steps = [
        {
          title: "B\u01B0\u1EDBc 1. T\u1EADp x\xE1c \u0111\u1ECBnh",
          content: "T\u1EADp x\xE1c \u0111\u1ECBnh: $D = \\mathbb{R}$."
        },
        {
          title: "B\u01B0\u1EDBc 2: T\xEDnh \u0111\u1EA1o h\xE0m y' v\xE0 t\xECm c\xE1c \u0111i\u1EC3m t\u1EDBi h\u1EA1n",
          content: `Ta c\xF3 \u0111\u1EA1o h\xE0m $y' = ${derivLatex}$.
Cho $y' = 0 \\Leftrightarrow x = 0$.`
        },
        {
          title: "B\u01B0\u1EDBc 3: T\xEDnh c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB, gi\u1EDBi h\u1EA1n, ti\u1EC7m c\u1EADn",
          content: `* Gi\u1EDBi h\u1EA1n: $\\lim_{x \\to \\pm\\infty} y = ${limQuartic}$.
* C\u1EF1c tr\u1ECB: T\u1EA1i $x = 0$, h\xE0m s\u1ED1 \u0111\u1EA1t gi\xE1 tr\u1ECB c\u1EF1c ti\u1EC3u/c\u1EF1c \u0111\u1EA1i $y = ${cLatex}$.`
        },
        {
          title: "B\u01B0\u1EDBc 4: B\u1EA3ng bi\u1EBFn thi\xEAn v\xE0 k\u1EBFt lu\u1EADn",
          content: a > 0 ? `H\xE0m s\u1ED1 ngh\u1ECBch bi\u1EBFn tr\xEAn kho\u1EA3ng $(-\\infty; 0)$ v\xE0 \u0111\u1ED3ng bi\u1EBFn tr\xEAn kho\u1EA3ng $(0; +\\infty)$.
* H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c ti\u1EC3u** t\u1EA1i $x = 0$, gi\xE1 tr\u1ECB c\u1EF1c ti\u1EC3u $y_{CT} = ${cLatex}$.` : `H\xE0m s\u1ED1 \u0111\u1ED3ng bi\u1EBFn tr\xEAn kho\u1EA3ng $(-\\infty; 0)$ v\xE0 ngh\u1ECBch bi\u1EBFn tr\xEAn kho\u1EA3ng $(0; +\\infty)$.
* H\xE0m s\u1ED1 \u0111\u1EA1t **c\u1EF1c \u0111\u1EA1i** t\u1EA1i $x = 0$, gi\xE1 tr\u1ECB c\u1EF1c \u0111\u1EA1i $y_{C\u0110} = ${cLatex}$.`
        }
      ];
      return { functionStr, functionLatex: exprLatex, txd: "D = \\mathbb{R}", derivative: derivLatex, x_points, y_prime, y_row, latex_code, explanation_steps };
    }
  }
  if (type === "trigonometric") {
    const isSin = functionStr.toLowerCase().includes("sin");
    const isCos = functionStr.toLowerCase().includes("cos");
    if (isSin && !functionStr.includes("+") && !functionStr.includes("*")) {
      const x_points = [
        { id: "x-0", latex: "-\\pi", type: "critical", value: -Math.PI },
        { id: "x-1", latex: "-\\frac{\\pi}{2}", type: "critical", value: -Math.PI / 2 },
        { id: "x-2", latex: "\\frac{\\pi}{2}", type: "critical", value: Math.PI / 2 },
        { id: "x-3", latex: "\\pi", type: "critical", value: Math.PI }
      ];
      const y_prime = {
        points: ["", "0", "0", ""],
        intervals: ["-", "+", "-"]
      };
      const y_row = {
        points: [
          { type: "single", latex: "0", position: "middle" },
          { type: "single", latex: "-1", position: "bottom" },
          { type: "single", latex: "1", position: "top" },
          { type: "single", latex: "0", position: "middle" }
        ]
      };
      const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=2.2]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\pi$, $-\\frac{\\pi}{2}$, $\\frac{\\pi}{2}$, $\\pi$}
\\tkzTabLine{, -, z, +, z, -, }
\\tkzTabVar{+/ $0$, -/ $-1$, +/ $1$, -/ $0$}
\\end{tikzpicture}`;
      const explanation_steps = [
        {
          title: "B\u01B0\u1EDBc 1. T\u1EADp x\xE1c \u0111\u1ECBnh",
          content: "T\u1EADp x\xE1c \u0111\u1ECBnh: $D = \\mathbb{R}$. Kh\u1EA3o s\xE1t tr\xEAn \u0111o\u1EA1n tu\u1EA7n ho\xE0n $[-\\pi; \\pi]$."
        },
        {
          title: "B\u01B0\u1EDBc 2: T\xEDnh \u0111\u1EA1o h\xE0m y' v\xE0 t\xECm c\xE1c \u0111i\u1EC3m t\u1EDBi h\u1EA1n",
          content: "Ta c\xF3 \u0111\u1EA1o h\xE0m $y' = \\cos x$. Cho $y' = 0 \\Leftrightarrow x = \\pm \\frac{\\pi}{2}$ tr\xEAn \u0111o\u1EA1n $[-\\pi; \\pi]$."
        },
        {
          title: "B\u01B0\u1EDBc 3: T\xEDnh c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB, gi\u1EDBi h\u1EA1n, ti\u1EC7m c\u1EADn",
          content: "Gi\xE1 tr\u1ECB h\xE0m s\u1ED1 t\u1EA1i c\xE1c \u0111i\u1EC3m bi\xEAn v\xE0 \u0111i\u1EC3m t\u1EDBi h\u1EA1n:\n* $y(-\\pi) = 0$, $y(\\pi) = 0$.\n* C\u1EF1c ti\u1EC3u t\u1EA1i $x = -\\frac{\\pi}{2}$ v\u1EDBi $y = -1$.\n* C\u1EF1c \u0111\u1EA1i t\u1EA1i $x = \\frac{\\pi}{2}$ v\u1EDBi $y = 1$."
        },
        {
          title: "B\u01B0\u1EDBc 4: B\u1EA3ng bi\u1EBFn thi\xEAn v\xE0 k\u1EBFt lu\u1EADn",
          content: "H\xE0m s\u1ED1 \u0111\u1ED3ng bi\u1EBFn tr\xEAn kho\u1EA3ng $(-\\frac{\\pi}{2}; \\frac{\\pi}{2})$, ngh\u1ECBch bi\u1EBFn tr\xEAn c\xE1c kho\u1EA3ng $(-\\pi; -\\frac{\\pi}{2})$ v\xE0 $(\\frac{\\pi}{2}; \\pi)$."
        }
      ];
      return { functionStr, functionLatex: "\\sin x", txd: "D = \\mathbb{R}", derivative: "\\cos x", x_points, y_prime, y_row, latex_code, explanation_steps };
    }
    if (isCos && !functionStr.includes("+") && !functionStr.includes("*")) {
      const x_points = [
        { id: "x-0", latex: "-\\pi", type: "critical", value: -Math.PI },
        { id: "x-1", latex: "0", type: "critical", value: 0 },
        { id: "x-2", latex: "\\pi", type: "critical", value: Math.PI }
      ];
      const y_prime = {
        points: ["", "0", ""],
        intervals: ["+", "-"]
      };
      const y_row = {
        points: [
          { type: "single", latex: "-1", position: "bottom" },
          { type: "single", latex: "1", position: "top" },
          { type: "single", latex: "-1", position: "bottom" }
        ]
      };
      const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=3.0]
  {$x$ / 1, $y'$ / 1, $y$ / 2.0}
  {$-\\pi$, $0$, $\\pi$}
\\tkzTabLine{, +, z, -, }
\\tkzTabVar{-/ $-1$, +/ $1$, -/ $-1$}
\\end{tikzpicture}`;
      const explanation_steps = [
        {
          title: "B\u01B0\u1EDBc 1. T\u1EADp x\xE1c \u0111\u1ECBnh",
          content: "T\u1EADp x\xE1c \u0111\u1ECBnh: $D = \\mathbb{R}$. Kh\u1EA3o s\xE1t tr\xEAn \u0111o\u1EA1n tu\u1EA7n ho\xE0n $[-\\pi; \\pi]$."
        },
        {
          title: "B\u01B0\u1EDBc 2: T\xEDnh \u0111\u1EA1o h\xE0m y' v\xE0 t\xECm c\xE1c \u0111i\u1EC3m t\u1EDBi h\u1EA1n",
          content: "Ta c\xF3 \u0111\u1EA1o h\xE0m $y' = -\\sin x$. Cho $y' = 0 \\Leftrightarrow x = 0$ tr\xEAn \u0111o\u1EA1n $[-\\pi; \\pi]$ (\u1EDF c\xE1c bi\xEAn $-\\pi, \\pi$ \u0111\u1EA1o h\xE0m c\u0169ng b\u1EB1ng $0$)."
        },
        {
          title: "B\u01B0\u1EDBc 3: T\xEDnh c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB, gi\u1EDBi h\u1EA1n, ti\u1EC7m c\u1EADn",
          content: "H\xE0m s\u1ED1 \u0111\u1EA1t gi\xE1 tr\u1ECB c\u1EF1c \u0111\u1EA1i $y = 1$ t\u1EA1i $x = 0$ v\xE0 \u0111\u1EA1t gi\xE1 tr\u1ECB bi\xEAn c\u1EF1c ti\u1EC3u $y = -1$ t\u1EA1i $x = \\pm \\pi$."
        },
        {
          title: "B\u01B0\u1EDBc 4: B\u1EA3ng bi\u1EBFn thi\xEAn v\xE0 k\u1EBFt lu\u1EADn",
          content: "H\xE0m s\u1ED1 \u0111\u1ED3ng bi\u1EBFn tr\xEAn kho\u1EA3ng $(-\\pi; 0)$ v\xE0 ngh\u1ECBch bi\u1EBFn tr\xEAn kho\u1EA3ng $(0; \\pi)$."
        }
      ];
      return { functionStr, functionLatex: "\\cos x", txd: "D = \\mathbb{R}", derivative: "-\\sin x", x_points, y_prime, y_row, latex_code, explanation_steps };
    }
  }
  return null;
}
function getDenominators(node) {
  const denoms = [];
  node.traverse((child) => {
    if (child.type === "OperatorNode" && child.op === "/") {
      denoms.push(child.args[1].toString());
    }
  });
  return denoms;
}
function findRoots(node, variable = "x") {
  let compiled;
  try {
    compiled = node.compile();
  } catch (err) {
    return [];
  }
  const roots = [];
  const start = -15;
  const end = 15;
  const step = 0.02;
  let prevVal;
  try {
    prevVal = compiled.evaluate({ [variable]: start });
  } catch (e) {
    prevVal = void 0;
  }
  for (let x = start + step; x <= end; x += step) {
    let val;
    try {
      val = compiled.evaluate({ [variable]: x });
    } catch {
      continue;
    }
    if (typeof val !== "number" || isNaN(val)) continue;
    if (Math.abs(val) < 1e-9) {
      if (!roots.some((r) => Math.abs(r - x) < 1e-4)) {
        roots.push(x);
      }
    } else if (prevVal !== void 0 && typeof prevVal === "number" && !isNaN(prevVal) && prevVal * val < 0) {
      let left = x - step;
      let right = x;
      let root = left;
      for (let iter = 0; iter < 40; iter++) {
        const mid = (left + right) / 2;
        let midVal;
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
      if (!roots.some((r) => Math.abs(r - root) < 1e-4)) {
        roots.push(root);
      }
    }
    prevVal = val;
  }
  return roots.sort((a, b) => a - b);
}
function analyzeFunctionCAS(functionStr) {
  let normalized = functionStr.replace(/y\s*=\s*/g, "").replace(/f\(x\)\s*=\s*/g, "").trim();
  if (!normalized) {
    normalized = "x^3 - 3*x + 2";
  }
  normalized = preprocessImplicitMultiplication(normalized);
  const node = math.parse(normalized);
  const functionLatex = node.toTex({ parenthesis: "keep" });
  const classification = classifyFunction(node);
  console.log(`[CAS Engine] Ph\xE2n lo\u1EA1i h\xE0m s\u1ED1: ${classification.type}`, classification.coeffs);
  const deterministicResult = analyzeDeterministic(classification, functionStr, functionLatex, node);
  if (deterministicResult) {
    console.log(`[CAS Engine] Ph\xE2n t\xEDch gi\u1EA3i t\xEDch th\xE0nh c\xF4ng b\u1EB1ng b\u1ED9 gi\u1EA3i to\xE1n ph\u1ED5 th\xF4ng.`);
    const poles2 = deterministicResult.x_points.filter((p) => p.type === "discontinuity" && p.value !== void 0 && isFinite(p.value)).map((p) => p.value);
    const criticals2 = deterministicResult.x_points.filter((p) => p.type === "critical" && p.value !== void 0 && isFinite(p.value)).map((p) => p.value);
    return {
      ...deterministicResult,
      poles: poles2,
      criticals: criticals2
    };
  }
  console.log(`[CAS Engine] Chuy\u1EC3n sang b\u1ED9 gi\u1EA3i CAS s\u1ED1 h\u1ECDc t\u1ED5ng qu\xE1t...`);
  const yEval = node.compile();
  const denoms = getDenominators(node);
  const polesSet = /* @__PURE__ */ new Set();
  denoms.forEach((denomStr) => {
    try {
      const denomNode = math.parse(denomStr);
      const roots = findRoots(denomNode);
      roots.forEach((r) => polesSet.add(parseFloat(r.toFixed(5))));
    } catch (e) {
    }
  });
  const poles = Array.from(polesSet).sort((a, b) => a - b);
  const dy = math.derivative(node, "x");
  const dySimplified = math.simplify(dy);
  const derivative2 = dySimplified.toTex();
  const dyEval = dySimplified.compile();
  const rawCriticals = findRoots(dySimplified);
  const criticals = rawCriticals.filter((c) => {
    if (poles.some((p) => Math.abs(p - c) < 1e-3)) return false;
    try {
      const leftVal = dyEval.evaluate({ x: c - 1e-4 });
      const rightVal = dyEval.evaluate({ x: c + 1e-4 });
      return leftVal * rightVal < -1e-10;
    } catch {
      return true;
    }
  });
  const x_points = [];
  x_points.push({ id: "x-0", latex: "-\\infty", type: "infinity", value: -Infinity });
  let pointCounter = 1;
  const sortedMilestones = [...poles.map((p) => ({ val: p, type: "discontinuity" })), ...criticals.map((c) => ({ val: c, type: "critical" }))].sort((a, b) => a.val - b.val);
  const uniqueMilestones = [];
  sortedMilestones.forEach((m) => {
    if (!uniqueMilestones.some((u) => Math.abs(u.val - m.val) < 1e-4)) {
      uniqueMilestones.push(m);
    }
  });
  uniqueMilestones.forEach((m) => {
    const exactLatex = toExactLatex(m.val);
    const parsedVal = parseLatexToVal(exactLatex);
    x_points.push({
      id: `x-${pointCounter++}`,
      latex: exactLatex,
      type: m.type,
      value: parsedVal !== null ? parsedVal : m.val
    });
  });
  x_points.push({ id: `x-${pointCounter}`, latex: "+\\infty", type: "infinity", value: Infinity });
  const N = x_points.length;
  const y_prime_points = [];
  const y_prime_intervals = [];
  x_points.forEach((p) => {
    if (p.type === "infinity") {
      y_prime_points.push("");
    } else if (p.type === "discontinuity") {
      y_prime_points.push("d");
    } else {
      y_prime_points.push("0");
    }
  });
  for (let i = 0; i < N - 1; i++) {
    const left = x_points[i].value;
    const right = x_points[i + 1].value;
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
      if (typeof dVal === "number" && !isNaN(dVal)) {
        if (dVal > 1e-7) {
          y_prime_intervals.push("+");
        } else if (dVal < -1e-7) {
          y_prime_intervals.push("-");
        } else {
          y_prime_intervals.push("+");
        }
      } else {
        y_prime_intervals.push("h");
      }
    } catch {
      y_prime_intervals.push("h");
    }
  }
  const y_points_vals = [];
  x_points.forEach((p, idx) => {
    if (p.type === "infinity") {
      const testVal = p.value === -Infinity ? -1e3 : 1e3;
      let limitVal;
      try {
        limitVal = yEval.evaluate({ x: testVal });
      } catch {
        limitVal = p.value === -Infinity ? -Infinity : Infinity;
      }
      if (typeof limitVal !== "number" || isNaN(limitVal)) {
        if (p.value === -Infinity) {
          const firstIntervalSign = y_prime_intervals[0];
          const yPos = firstIntervalSign === "+" ? "bottom" : "top";
          y_points_vals.push({
            type: "single",
            latex: firstIntervalSign === "+" ? "-\\infty" : "+\\infty",
            position: yPos
          });
        } else {
          const lastIntervalSign = y_prime_intervals[y_prime_intervals.length - 1];
          const yPos = lastIntervalSign === "+" ? "top" : "bottom";
          y_points_vals.push({
            type: "single",
            latex: lastIntervalSign === "+" ? "+\\infty" : "-\\infty",
            position: yPos
          });
        }
      } else {
        if (limitVal < -50) {
          y_points_vals.push({ type: "single", latex: "-\\infty", position: "bottom" });
        } else if (limitVal > 50) {
          y_points_vals.push({ type: "single", latex: "+\\infty", position: "top" });
        } else {
          y_points_vals.push({ type: "single", latex: toExactLatex(limitVal), position: "middle" });
        }
      }
    } else if (p.type === "discontinuity") {
      const poleVal = p.value;
      const epsilon = 1e-5;
      let leftLim;
      try {
        leftLim = yEval.evaluate({ x: poleVal - epsilon });
      } catch {
        leftLim = -Infinity;
      }
      let rightLim;
      try {
        rightLim = yEval.evaluate({ x: poleVal + epsilon });
      } catch {
        rightLim = Infinity;
      }
      const latexLeft = typeof leftLim === "number" && !isNaN(leftLim) ? leftLim < -50 ? "-\\infty" : leftLim > 50 ? "+\\infty" : toExactLatex(leftLim) : y_prime_intervals[idx - 1] === "+" ? "+\\infty" : "-\\infty";
      const latexRight = typeof rightLim === "number" && !isNaN(rightLim) ? rightLim < -50 ? "-\\infty" : rightLim > 50 ? "+\\infty" : toExactLatex(rightLim) : y_prime_intervals[idx] === "+" ? "-\\infty" : "+\\infty";
      const positionLeft = latexLeft.includes("-\\infty") ? "bottom" : latexLeft.includes("+\\infty") ? "top" : "middle";
      const positionRight = latexRight.includes("-\\infty") ? "bottom" : latexRight.includes("+\\infty") ? "top" : "middle";
      y_points_vals.push({ type: "discontinuity", latexLeft, positionLeft, latexRight, positionRight });
    } else {
      const critVal = p.value;
      let val;
      try {
        val = yEval.evaluate({ x: critVal });
      } catch {
        val = 0;
      }
      const leftSign = y_prime_intervals[idx - 1];
      const rightSign = y_prime_intervals[idx];
      let position = "middle";
      if (leftSign === "+" && rightSign === "-") {
        position = "top";
      } else if (leftSign === "-" && rightSign === "+") {
        position = "bottom";
      }
      y_points_vals.push({
        type: "single",
        latex: typeof val === "number" && !isNaN(val) ? toExactLatex(val) : "0",
        position
      });
    }
  });
  y_points_vals.forEach((yv, i) => {
    if (yv.type === "single") {
      if (x_points[i].type === "infinity") {
        if (yv.latex === "-\\infty") {
          yv.position = "bottom";
        } else if (yv.latex === "+\\infty") {
          yv.position = "top";
        } else {
          if (i === 0) {
            const nextSign = y_prime_intervals[0];
            yv.position = nextSign === "+" ? "bottom" : "top";
          } else if (i === N - 1) {
            const prevSign = y_prime_intervals[y_prime_intervals.length - 1];
            yv.position = prevSign === "+" ? "top" : "bottom";
          }
        }
      }
    }
  });
  const y_row = { points: y_points_vals };
  const espcl = Math.max(1.5, parseFloat((8 / (N - 1)).toFixed(1)));
  const xList = x_points.map((p) => `$${p.latex}$`).join(", ");
  const yPrimeLineParts = [];
  for (let i = 0; i < N; i++) {
    if (i === 0) {
      yPrimeLineParts.push("");
    } else {
      yPrimeLineParts.push(y_prime_intervals[i - 1]);
    }
    if (x_points[i].type === "discontinuity") {
      yPrimeLineParts.push("d");
    } else if (x_points[i].type === "critical") {
      yPrimeLineParts.push("z");
    } else if (i > 0 && i < N - 1) {
      yPrimeLineParts.push("");
    }
  }
  yPrimeLineParts.push("");
  const yPrimeLine = yPrimeLineParts.join(", ");
  const yVarParts = [];
  y_points_vals.forEach((yv, i) => {
    if (yv.type === "single") {
      const sign = yv.position === "top" ? "+" : "-";
      yVarParts.push(`${sign}/ $${yv.latex}$`);
    } else {
      const leftSign = yv.positionLeft === "top" ? "+" : "-";
      const rightSign = yv.positionRight === "top" ? "+" : "-";
      yVarParts.push(`${leftSign}D${rightSign}/ $${yv.latexLeft}$ / $${yv.latexRight}$`);
    }
  });
  const yVarLine = yVarParts.join(", ");
  const latex_code = `\\begin{tikzpicture}
\\tkzTabInit[lgt=1.5, espcl=${espcl}]
  {$x$ / 1, $y'$ / 1, $y$ / 2.5}
  {${xList}}
\\tkzTabLine{${yPrimeLine}}
\\tkzTabVar{${yVarLine}}
\\end{tikzpicture}`;
  const explanation_steps = [];
  let txdLatex = "D = \\mathbb{R}";
  let txdContent = "T\u1EADp x\xE1c \u0111\u1ECBnh c\u1EE7a h\xE0m s\u1ED1: $D = \\mathbb{R}$.";
  if (poles.length > 0) {
    const poleLatexList = poles.map((p) => toExactLatex(p)).join("; ");
    txdLatex = `D = \\mathbb{R} \\setminus \\{${poleLatexList}\\}`;
    txdContent = `T\u1EADp x\xE1c \u0111\u1ECBnh c\u1EE7a h\xE0m s\u1ED1: $D = \\mathbb{R} \\setminus \\{${poleLatexList}\\}$.`;
  }
  explanation_steps.push({ title: "B\u01B0\u1EDBc 1. T\u1EADp x\xE1c \u0111\u1ECBnh", content: txdContent });
  let derivativeExplanation = `Ta c\xF3 \u0111\u1EA1o h\xE0m $y' = ${derivative2}$. `;
  if (criticals.length > 0) {
    const rootEquations = criticals.map((c) => `x = ${toExactLatex(c)}`).join(", ");
    derivativeExplanation += `Cho $y' = 0 \\Leftrightarrow ${rootEquations}$. `;
  } else {
    derivativeExplanation += `Ta th\u1EA5y $y' \\neq 0$ v\u1EDBi m\u1ECDi $x \\in D$. `;
  }
  if (poles.length > 0) {
    const poleLatexList = poles.map((p) => `$x = ${toExactLatex(p)}$`).join(", ");
    derivativeExplanation += `\u0110\u1EA1o h\xE0m kh\xF4ng x\xE1c \u0111\u1ECBnh t\u1EA1i ${poleLatexList}.`;
  }
  explanation_steps.push({ title: "B\u01B0\u1EDBc 2: T\xEDnh \u0111\u1EA1o h\xE0m y' v\xE0 t\xECm c\xE1c \u0111i\u1EC3m t\u1EDBi h\u1EA1n", content: derivativeExplanation.trim() });
  let limitExplanation = `T\xEDnh gi\u1EDBi h\u1EA1n t\u1EA1i v\xF4 c\u1EF1c v\xE0 t\u1EA1i c\xE1c \u0111i\u1EC3m gi\xE1n \u0111o\u1EA1n:
`;
  if (poles.length > 0) {
    limitExplanation += `* Ti\u1EC7m c\u1EADn \u0111\u1EE9ng: `;
    poles.forEach((p) => {
      const pLatex = toExactLatex(p);
      limitExplanation += `$\\displaystyle \\lim_{x \\to ${pLatex}^-} y = \\pm\\infty$ v\xE0 $\\displaystyle \\lim_{x \\to ${pLatex}^+} y = \\pm\\infty$, do \u0111\xF3 $x = ${pLatex}$ l\xE0 ti\u1EC7m c\u1EADn \u0111\u1EE9ng. `;
    });
    limitExplanation += `
`;
  }
  limitExplanation += `* Gi\u1EDBi h\u1EA1n t\u1EA1i v\xF4 c\u1EF1c: $\\displaystyle \\lim_{x \\to -\\infty} y$ v\xE0 $\\displaystyle \\lim_{x \\to +\\infty} y$ \u0111\u01B0\u1EE3c x\xE1c \u0111\u1ECBnh d\u1EF1a tr\xEAn b\u1EADc cao nh\u1EA5t.
`;
  explanation_steps.push({ title: "B\u01B0\u1EDBc 3: T\xEDnh c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB, gi\u1EDBi h\u1EA1n, ti\u1EC7m c\u1EADn", content: limitExplanation.trim() });
  let bbtExplanation = `D\u1EF1a v\xE0o b\u1EA3ng bi\u1EBFn thi\xEAn, k\u1EBFt lu\u1EADn:
`;
  y_prime_intervals.forEach((sign, i) => {
    const leftX = x_points[i].latex;
    const rightX = x_points[i + 1].latex;
    bbtExplanation += `* H\xE0m s\u1ED1 **${sign === "+" ? "\u0111\u1ED3ng bi\u1EBFn" : "ngh\u1ECBch bi\u1EBFn"}** tr\xEAn kho\u1EA3ng $(${leftX}; ${rightX})$.
`;
  });
  explanation_steps.push({ title: "B\u01B0\u1EDBc 4: B\u1EA3ng bi\u1EBFn thi\xEAn v\xE0 k\u1EBFt lu\u1EADn", content: bbtExplanation });
  return { functionStr, functionLatex, txd: txdLatex, derivative: derivative2, x_points, y_prime: { points: y_prime_points, intervals: y_prime_intervals }, y_row, latex_code, explanation_steps, poles, criticals };
}

// server.ts
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json());
var apiKey = process.env.GEMINI_API_KEY;
var ai = new import_genai.GoogleGenAI({
  apiKey: apiKey || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
app.post("/api/analyze-function", async (req, res) => {
  try {
    let { functionStr } = req.body;
    if (!functionStr || typeof functionStr !== "string") {
      res.status(400).json({ error: "Vui l\xF2ng cung c\u1EA5p c\xF4ng th\u1EE9c h\xE0m s\u1ED1 h\u1EE3p l\u1EC7." });
      return;
    }
    functionStr = preprocessImplicitMultiplication(functionStr.trim());
    try {
      console.log(`[CAS Engine] \u0110ang ph\xE2n t\xEDch t\u1EF1 \u0111\u1ED9ng: "${functionStr}"`);
      const casResult = analyzeFunctionCAS(functionStr);
      res.json(casResult);
      return;
    } catch (casError) {
      console.warn("[CAS Engine] Kh\xF4ng th\u1EC3 ph\xE2n t\xEDch t\u1EF1 \u0111\u1ED9ng b\u1EB1ng math.js, \u0111ang chuy\u1EC3n h\u01B0\u1EDBng sang Gemini AI...", casError);
    }
    if (!apiKey) {
      res.status(500).json({ error: "Thi\u1EBFu c\u1EA5u h\xECnh GEMINI_API_KEY tr\xEAn server. Vui l\xF2ng c\xE0i \u0111\u1EB7t trong m\u1EE5c Settings > Secrets." });
      return;
    }
    const systemInstruction = `B\u1EA1n l\xE0 m\u1ED9t chuy\xEAn gia To\xE1n h\u1ECDc trung h\u1ECDc ph\u1ED5 th\xF4ng Vi\u1EC7t Nam xu\u1EA5t s\u1EAFc v\xE0 l\xE0 m\u1ED9t l\u1EADp tr\xECnh vi\xEAn LaTeX k\u1EF3 c\u1EF1u. 
Nhi\u1EC7m v\u1EE5 c\u1EE7a b\u1EA1n l\xE0 nh\u1EADn v\xE0o c\xF4ng th\u1EE9c c\u1EE7a m\u1ED9t h\xE0m s\u1ED1 to\xE1n h\u1ECDc (c\xF3 th\u1EC3 ch\u1EE9a \u0111a th\u1EE9c, ph\xE2n th\u1EE9c, c\u0103n th\u1EE9c, m\u0169, logarit, l\u01B0\u1EE3ng gi\xE1c, v\xED d\u1EE5: "x^3 - 3*x + 2", "(2x - 1)/(x + 1)", "ln(x)", "x * e^x") v\xE0 th\u1EF1c hi\u1EC7n ph\xE2n t\xEDch \u0111\u1EA7y \u0111\u1EE7, ch\xEDnh x\xE1c tuy\u1EC7t \u0111\u1ED1i \u0111\u1EC3 d\u1EF1ng B\u1EA3ng bi\u1EBFn thi\xEAn (BBT) theo phong c\xE1ch to\xE1n h\u1ECDc chu\u1EA9n c\u1EE7a B\u1ED9 Gi\xE1o d\u1EE5c v\xE0 \u0110\xE0o t\u1EA1o Vi\u1EC7t Nam.

B\u1EA1n C\u1EA6N xu\u1EA5t d\u1EEF li\u1EC7u d\u01B0\u1EDBi d\u1EA1ng JSON kh\u1EDBp ho\xE0n h\u1EA3o v\u1EDBi schema \u0111\u01B0\u1EE3c cung c\u1EA5p.

Quy t\u1EAFc to\xE1n h\u1ECDc c\u1EF1c k\u1EF3 quan tr\u1ECDng:
1. T\u1EADp x\xE1c \u0111\u1ECBnh (TXD): Vi\u1EBFt d\u01B0\u1EDBi d\u1EA1ng c\xF4ng th\u1EE9c LaTeX ho\xE0n ch\u1EC9nh, v\xED d\u1EE5: "D = \\mathbb{R}" ho\u1EB7c "D = \\mathbb{R} \\setminus \\{-1\\}" ho\u1EB7c "D = (0; +\\infty)".
2. C\xF4ng th\u1EE9c \u0111\u1EA1o h\xE0m y': T\xEDnh to\xE1n ch\xEDnh x\xE1c \u0111\u1EA1o h\xE0m v\xE0 bi\u1EC3u di\u1EC5n \u1EDF \u0111\u1ECBnh d\u1EA1ng LaTeX \u0111\u1EB9p m\u1EAFt, v\xED d\u1EE5: "y' = 3x^2 - 3" ho\u1EB7c "y' = \\frac{3}{(x+1)^2}".
3. D\xF2ng ho\xE0nh \u0111\u1ED9 x (x_points):
   - Ph\u1EA3i s\u1EAFp x\u1EBFp c\xE1c m\u1ED1c ho\xE0nh \u0111\u1ED9 x t\u0103ng d\u1EA7n t\u1EEB tr\xE1i sang ph\u1EA3i: b\u1EAFt \u0111\u1EA7u b\u1EB1ng "-\\infty" (n\u1EBFu mi\u1EC1n x\xE1c \u0111\u1ECBnh v\xF4 h\u1EA1n v\u1EC1 ph\xEDa \xE2m) v\xE0 k\u1EBFt th\xFAc b\u1EB1ng "+\\infty" (n\u1EBFu mi\u1EC1n x\xE1c \u0111\u1ECBnh v\xF4 h\u1EA1n v\u1EC1 ph\xEDa d\u01B0\u01A1ng).
   - Bao g\u1ED3m t\u1EA5t c\u1EA3 c\xE1c m\u1ED1c \u0111\u1EB7c bi\u1EC7t: \u0111i\u1EC3m bi\xEAn c\u1EE7a t\u1EADp x\xE1c \u0111\u1ECBnh (v\xED d\u1EE5: \u0111i\u1EC3m m\xE0 h\xE0m gi\xE1n \u0111o\u1EA1n ho\u1EB7c kh\xF4ng x\xE1c \u0111\u1ECBnh nh\u01B0 x = -1 c\u1EE7a h\xE0m ph\xE2n th\u1EE9c), v\xE0 c\xE1c \u0111i\u1EC3m c\u1EF1c tr\u1ECB (nghi\u1EC7m c\u1EE7a y' = 0).
   - M\u1ED7i \u0111i\u1EC3m c\xF3:
     - "id": sinh ng\u1EABu nhi\xEAn duy nh\u1EA5t (v\xED d\u1EE5: "x-0", "x-1", ...)
     - "latex": chu\u1ED7i LaTeX bi\u1EC3u di\u1EC5n m\u1ED1c \u0111\xF3 (v\xED d\u1EE5: "-\\infty", "-1", "0", "1", "+\\infty", "\\sqrt{2}").
     - "type": "infinity" (cho v\xF4 c\u1EF1c), "critical" (cho c\u1EF1c tr\u1ECB ho\u1EB7c \u0111i\u1EC3m th\u01B0\u1EDDng), "discontinuity" (cho \u0111i\u1EC3m gi\xE1n \u0111o\u1EA1n, ti\u1EC7m c\u1EADn \u0111\u1EE9ng, h\xE0m s\u1ED1 kh\xF4ng x\xE1c \u0111\u1ECBnh).
     - "value": gi\xE1 tr\u1ECB s\u1ED1 th\u1EF1c x\u1EA5p x\u1EC9 t\u01B0\u01A1ng \u1EE9ng (\u0111\u1EC3 s\u1EAFp x\u1EBFp).
4. D\xF2ng \u0111\u1EA1o h\xE0m y' (y_prime):
   - M\u1EA3ng "points": Ch\u1EE9a k\xFD hi\u1EC7u t\u1EA1i m\u1ED7i m\u1ED1c x. C\xE1c gi\xE1 tr\u1ECB c\xF3 th\u1EC3 l\xE0 "0" (nghi\u1EC7m c\u1EE7a y'=0), "d" (kh\xF4ng x\xE1c \u0111\u1ECBnh, v\u1EBD 2 v\u1EA1ch song song "||"), ho\u1EB7c "" (kh\xF4ng ghi g\xEC, v\xED d\u1EE5 \u1EDF v\xF4 c\u1EF1c). \u0110\u1ED9 d\xE0i b\u1EB1ng x_points.
   - M\u1EA3ng "intervals": Ch\u1EE9a d\u1EA5u c\u1EE7a y' tr\xEAn c\xE1c kho\u1EA3ng gi\u1EEFa c\xE1c m\u1ED1c x. Gi\xE1 tr\u1ECB c\xF3 th\u1EC3 l\xE0 "+" (\u0111\u1EA1o h\xE0m d\u01B0\u01A1ng), "-" (\u0111\u1EA1o h\xE0m \xE2m), ho\u1EB7c "h" (kho\u1EA3ng kh\xF4ng x\xE1c \u0111\u1ECBnh / b\u1ECB g\u1EA1ch ch\xE9o). \u0110\u1ED9 d\xE0i b\u1EB1ng x_points.length - 1.
5. D\xF2ng gi\xE1 tr\u1ECB y (y_row):
   - M\u1EA3ng "points": Ch\u1EE9a th\xF4ng tin bi\u1EC3u di\u1EC5n y t\u1EA1i m\u1ED7i m\u1ED1c x. M\u1ED7i ph\u1EA7n t\u1EED c\xF3 c\u1EA5u tr\xFAc:
     - N\u1EBFu l\xE0 \u0111i\u1EC3m th\u01B0\u1EDDng ("type": "single"): c\xF3 "latex" (gi\xE1 tr\u1ECB y, v\xED d\u1EE5: "4", "0", "-\\infty", "+\\infty") v\xE0 "position" ("top" n\u1EBFu l\xE0 c\u1EF1c \u0111\u1EA1i ho\u1EB7c gi\u1EDBi h\u1EA1n d\u01B0\u01A1ng v\xF4 c\u1EF1c, "bottom" n\u1EBFu l\xE0 c\u1EF1c ti\u1EC3u ho\u1EB7c gi\u1EDBi h\u1EA1n \xE2m v\xF4 c\u1EF1c, "middle" n\u1EBFu n\u1EB1m gi\u1EEFa).
     - N\u1EBFu l\xE0 \u0111i\u1EC3m gi\xE1n \u0111o\u1EA1n song song hai v\u1EA1ch ("type": "discontinuity"): c\xF3 "latexLeft" (gi\u1EDBi h\u1EA1n b\xEAn tr\xE1i, v\xED d\u1EE5 "-\\infty"), "positionLeft" ("top"|"middle"|"bottom"), "latexRight" (gi\u1EDBi h\u1EA1n b\xEAn ph\u1EA3i, v\xED d\u1EE5 "+\\infty"), v\xE0 "positionRight" ("top"|"middle"|"bottom").
6. LaTeX Code (latex_code): 
   - T\u1EA1o m\xE3 LaTeX ho\xE0n ch\u1EC9nh v\xE0 t\u1EF1 ch\u1EA1y \u0111\u01B0\u1EE3c s\u1EED d\u1EE5ng g\xF3i "tkz-tab" \u0111\u1EC3 v\u1EBD BBT c\u1EE7a h\xE0m s\u1ED1 n\xE0y.
   - S\u1EED d\u1EE5ng \\tkzTabInit, \\tkzTabLine, \\tkzTabVar \u0111\xFAng c\xFA ph\xE1p c\u1EE7a tkz-tab.
   - T\xEDnh to\xE1n t\u1EF1 \u0111\u1ED9ng kho\u1EA3ng c\xE1ch c\u1ED9t \u0111\u1EC3 tr\xE1nh b\u1ECB tr\xE0n l\u1EC1 ho\u1EB7c qu\xE1 kh\xEDt ch\u1EEF: C\xF4ng th\u1EE9c t\xEDnh espcl t\u1ED1i \u01B0u l\xE0 espcl = max(1.5, 8.0 / so_cot) (v\u1EDBi so_cot l\xE0 s\u1ED1 l\u01B0\u1EE3ng \u0111i\u1EC3m ho\xE0nh \u0111\u1ED9 x). C\u1EA5u h\xECnh v\xED d\u1EE5: \\tkzTabInit[lgt=2.5, espcl=...]...
   - V\xED d\u1EE5 h\xE0m tr\xF9ng ph\u01B0\u01A1ng ho\u1EB7c ph\xE2n th\u1EE9c: s\u1EED d\u1EE5ng \u0111\xFAng t\xF9y ch\u1ECDn "d" cho hai v\u1EA1ch, "z" cho s\u1ED1 0, "+D-" cho gi\xE1n \u0111o\u1EA1n \u1EDF d\xF2ng y.
7. C\xE1c b\u01B0\u1EDBc ph\xE2n t\xEDch h\xE0m s\u1ED1 (explanation_steps) bao g\u1ED3m \u0110\xDANG 4 B\u01AF\u1EDAC theo chu\u1EA9n sau:
   - B\u01B0\u1EDBc 1. T\u1EADp x\xE1c \u0111\u1ECBnh: D= ... (\u0111\u1ECBnh d\u1EA1ng title l\xE0 "B\u01B0\u1EDBc 1. T\u1EADp x\xE1c \u0111\u1ECBnh")
   - B\u01B0\u1EDBc 2: T\xEDnh \u0111\u1EA1o h\xE0m y' v\xE0 t\xECm c\xE1c \u0111i\u1EC3m t\u1EDBi h\u1EA1n (\u0111\u1ECBnh d\u1EA1ng title l\xE0 "B\u01B0\u1EDBc 2: T\xEDnh \u0111\u1EA1o h\xE0m y' v\xE0 t\xECm c\xE1c \u0111i\u1EC3m t\u1EDBi h\u1EA1n")
   - B\u01B0\u1EDBc 3: L\u1EADp b\u1EA3ng bi\u1EBFn thi\xEAn \u0111\u1ED3ng th\u1EDDi t\xEDnh c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB, gi\u1EDBi h\u1EA1n t\u1EA1i v\xF4 c\u1EF1c, ti\u1EC7m c\u1EADn n\u1EBFu c\xF3 (\u0111\u1ECBnh d\u1EA1ng title l\xE0 "B\u01B0\u1EDBc 3: T\xEDnh c\xE1c gi\xE1 tr\u1ECB c\u1EF1c tr\u1ECB, gi\u1EDBi h\u1EA1n, ti\u1EC7m c\u1EADn")
   - B\u01B0\u1EDBc 4: L\u1EADp b\u1EA3ng bi\u1EBFn thi\xEAn v\xE0 n\xEAu k\u1EBFt lu\u1EADn: kho\u1EA3ng \u0111\u01A1n \u0111i\u1EC7u, c\u1EF1c tr\u1ECB, ti\u1EC7m c\u1EADn (\u0111\u1ECBnh d\u1EA1ng title l\xE0 "B\u01B0\u1EDBc 4: B\u1EA3ng bi\u1EBFn thi\xEAn v\xE0 k\u1EBFt lu\u1EADn").`;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `H\xE3y ph\xE2n t\xEDch h\xE0m s\u1ED1 sau v\xE0 tr\u1EA3 v\u1EC1 BBT chi ti\u1EBFt: "${functionStr}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          required: ["functionStr", "functionLatex", "txd", "derivative", "x_points", "y_prime", "y_row", "latex_code", "explanation_steps"],
          properties: {
            functionStr: { type: import_genai.Type.STRING },
            functionLatex: { type: import_genai.Type.STRING },
            txd: { type: import_genai.Type.STRING },
            derivative: { type: import_genai.Type.STRING },
            x_points: {
              type: import_genai.Type.ARRAY,
              items: {
                type: import_genai.Type.OBJECT,
                required: ["id", "latex", "type"],
                properties: {
                  id: { type: import_genai.Type.STRING },
                  latex: { type: import_genai.Type.STRING },
                  type: { type: import_genai.Type.STRING, enum: ["infinity", "critical", "discontinuity"] },
                  value: { type: import_genai.Type.NUMBER }
                }
              }
            },
            y_prime: {
              type: import_genai.Type.OBJECT,
              required: ["points", "intervals"],
              properties: {
                points: {
                  type: import_genai.Type.ARRAY,
                  items: { type: import_genai.Type.STRING }
                  // empty, '0', or 'd'
                },
                intervals: {
                  type: import_genai.Type.ARRAY,
                  items: { type: import_genai.Type.STRING }
                  // '+', '-', or 'h'
                }
              }
            },
            y_row: {
              type: import_genai.Type.OBJECT,
              required: ["points"],
              properties: {
                points: {
                  type: import_genai.Type.ARRAY,
                  items: {
                    type: import_genai.Type.OBJECT,
                    required: ["type"],
                    properties: {
                      type: { type: import_genai.Type.STRING, enum: ["single", "discontinuity"] },
                      latex: { type: import_genai.Type.STRING },
                      position: { type: import_genai.Type.STRING, enum: ["top", "middle", "bottom"] },
                      latexLeft: { type: import_genai.Type.STRING },
                      positionLeft: { type: import_genai.Type.STRING, enum: ["top", "middle", "bottom"] },
                      latexRight: { type: import_genai.Type.STRING },
                      positionRight: { type: import_genai.Type.STRING, enum: ["top", "middle", "bottom"] }
                    }
                  }
                }
              }
            },
            latex_code: { type: import_genai.Type.STRING },
            explanation_steps: {
              type: import_genai.Type.ARRAY,
              items: {
                type: import_genai.Type.OBJECT,
                required: ["title", "content"],
                properties: {
                  title: { type: import_genai.Type.STRING },
                  content: { type: import_genai.Type.STRING }
                }
              }
            }
          }
        }
      }
    });
    const resultText = response.text;
    if (!resultText) {
      throw new Error("Kh\xF4ng nh\u1EADn \u0111\u01B0\u1EE3c ph\u1EA3n h\u1ED3i ph\xE2n t\xEDch t\u1EEB m\xF4 h\xECnh AI.");
    }
    const data = JSON.parse(resultText.trim());
    res.json(data);
  } catch (error) {
    console.error("L\u1ED7i khi ph\xE2n t\xEDch h\xE0m s\u1ED1:", error);
    res.status(500).json({ error: error?.message || "C\xF3 l\u1ED7i x\u1EA3y ra trong qu\xE1 tr\xECnh ph\xE2n t\xEDch." });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Tr\xECnh T\u1EA1o B\u1EA3ng Bi\u1EBFn Thi\xEAn \u0111ang ch\u1EA1y t\u1EA1i http://localhost:${PORT}`);
  });
}
startServer();
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
//# sourceMappingURL=server.cjs.map
