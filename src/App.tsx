/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { MathWYSIWYMInput } from './components/MathWYSIWYMInput';
import { VisualBBT } from './components/VisualBBT';
import { ExplanationPanel } from './components/ExplanationPanel';
import { MathLaTeX } from './components/MathLaTeX';
import { FunctionAnalysis } from './types';
import { 
  Calculator, 
  HelpCircle, 
  Settings, 
  GraduationCap, 
  BookOpen, 
  ArrowRight, 
  Check, 
  Eye, 
  EyeOff, 
  RotateCcw, 
  Copy, 
  CheckCircle2, 
  FileCode, 
  Printer, 
  AlertTriangle,
  Lightbulb,
  CornerDownRight,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Sidebar code in the same or separate file. We created Sidebar in `/src/components/Sidebar.tsx` but named it 'Sidebar'.
// Let's import Sidebar correctly. Wait, our sidebar was created in `/src/components/Sidebar.tsx`.
// So we can import it from `./components/Sidebar`.
import { Sidebar as AppSidebar } from './components/Sidebar';

// Predefined loading messages to keep user engaged during mathematical analysis
const LOADING_MESSAGES = [
  "Đang khảo sát tập xác định (TXD) của hàm số...",
  "Đang tính toán biểu thức đạo hàm bậc nhất y'...",
  "Đang tìm cực trị bằng cách giải nghiệm y' = 0...",
  "Đang tính giới hạn tại vô cực và tiệm cận đứng...",
  "Đang thiết lập bảng biến thiên với sơ đồ mũi tên...",
  "Đang tạo mã tkz-tab LaTeX tối ưu...",
  "Hoàn thiện dữ liệu và hiển thị bảng biến thiên..."
];

// Robust utility to convert raw expression into a formatted LaTeX mathematical representation for WYSIWYM
function getLiveLaTeX(expr: string): string {
  if (!expr) return '';
  
  let s = expr;
  
  // Clean dividing symbol
  s = s.replace(/÷/g, '/');
  
  // 1. Fractions: (a)/(b) -> \frac{a}{b}
  s = s.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '\\frac{$1}{$2}');
  s = s.replace(/\b([a-zA-Z0-9_]+)\/\(([^)]+)\)/g, '\\frac{$1}{$2}');
  s = s.replace(/\(([^)]+)\)\/([a-zA-Z0-9_]+)\b/g, '\\frac{$1}{$2}');
  s = s.replace(/\b([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)\b/g, '\\frac{$1}{$2}');
  
  // 2. Square roots: sqrt(anything) -> \sqrt{anything}
  for (let i = 0; i < 5; i++) {
    s = s.replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}');
  }
  
  // 3. Absolute value: abs(anything) -> |anything|
  for (let i = 0; i < 5; i++) {
    s = s.replace(/abs\(([^)]+)\)/g, '\\left|$1\\right|');
  }
  
  // 4. Powers: x^2 -> x^2, (anything)^2 -> {anything}^2
  s = s.replace(/\(([^)]+)\)\^([a-zA-Z0-9\+\-]+)/g, '{$1}^{$2}');
  s = s.replace(/([a-zA-Z0-9]+)\^([a-zA-Z0-9\+\-]+)/g, '$1^{$2}');
  s = s.replace(/\^([a-zA-Z0-9\+\-]+)/g, '^{$1}');
  
  // 5. Functions: sin, cos, tan, cot, ln, log, log10, exp
  s = s.replace(/\b(sin|cos|tan|cot|ln|log|log10|exp)\(([^)]+)\)/g, '\\$1\\left($2\\right)');
  s = s.replace(/\b(sin|cos|tan|cot|ln|log|log10|exp)\b/g, '\\$1 ');
  
  // 6. Multiplication: a*b -> a \cdot b
  s = s.replace(/\*/g, ' \\cdot ');
  
  // 7. Standard formatting cleanup
  s = s.replace(/\bpi\b/g, '\\pi ');
  
  return s;
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [functionInput, setFunctionInput] = useState<string>("x^3 - 3*x + 2");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState<number>(0);
  const [analysis, setAnalysis] = useState<FunctionAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Global role state
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  
  // App Modes: 'view' | 'teacher' | 'student'
  const [mode, setMode] = useState<'view' | 'teacher' | 'student'>('view');
  
  // Exercise creation / Teacher mode state
  const [maskedCellIds, setMaskedCellIds] = useState<Set<string>>(new Set());
  const [placeholderStyle, setPlaceholderStyle] = useState<'fbox' | 'dots' | 'question'>('fbox');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isCopiedFull, setIsCopiedFull] = useState<boolean>(false);

  // Student mode state
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState<boolean>(false);
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null);
  const [showConfetti, setShowConfetti] = useState<boolean>(false);

  // Search History
  const [history, setHistory] = useState<string[]>([]);

  // Toggle Graph & Explanation Panel
  const [showGraph, setShowGraph] = useState<boolean>(true);
  const [showExplanation, setShowExplanation] = useState<boolean>(true);
  const [showHistory, setShowHistory] = useState<boolean>(true);

  // Visual Math Template Builder states
  const [selectedTemplate, setSelectedTemplate] = useState<'cubic' | 'quartic' | 'rational' | 'sqrt' | 'log_exp' | null>(null);
  const [tempValues, setTempValues] = useState<Record<string, string>>({
    cubic_a: "1",
    cubic_b: "0",
    cubic_c: "-3",
    cubic_d: "2",
    quartic_a: "1",
    quartic_b: "-2",
    quartic_c: "-1",
    rational_a: "2",
    rational_b: "-1",
    rational_c: "1",
    rational_d: "1",
    sqrt_a: "1",
    sqrt_b: "0",
    sqrt_c: "-1",
    logexp_a: "1",
    logexp_b: "1",
    logexp_type: "ln",
    logexp_c: "0"
  });

  const updateTempValue = (key: string, val: string) => {
    setTempValues(prev => ({
      ...prev,
      [key]: val
    }));
  };

  // Sync template values to functionInput
  useEffect(() => {
    if (!selectedTemplate) return;
    
    let formula = "";
    if (selectedTemplate === 'cubic') {
      const a = tempValues.cubic_a || "0";
      const b = tempValues.cubic_b || "0";
      const c = tempValues.cubic_c || "0";
      const d = tempValues.cubic_d || "0";
      
      const terms = [];
      if (a !== "0" && a !== "") {
        terms.push(a === "1" ? "x^3" : a === "-1" ? "-x^3" : `${a}*x^3`);
      }
      if (b !== "0" && b !== "") {
        const bSign = parseFloat(b) > 0 && terms.length > 0 ? "+" : "";
        terms.push(`${bSign}${b === "1" ? "x^2" : b === "-1" ? "-x^2" : `${b}*x^2`}`);
      }
      if (c !== "0" && c !== "") {
        const cSign = parseFloat(c) > 0 && terms.length > 0 ? "+" : "";
        terms.push(`${cSign}${c === "1" ? "x" : c === "-1" ? "-x" : `${c}*x`}`);
      }
      if (d !== "0" && d !== "") {
        const dSign = parseFloat(d) > 0 && terms.length > 0 ? "+" : "";
        terms.push(`${dSign}${d}`);
      }
      formula = terms.join(" ").replace(/\s*\+\s*-/g, " - ").replace(/\s*\+\s*\+/g, " + ").trim();
      if (!formula) formula = "0";
    } 
    else if (selectedTemplate === 'quartic') {
      const a = tempValues.quartic_a || "0";
      const b = tempValues.quartic_b || "0";
      const c = tempValues.quartic_c || "0";
      
      const terms = [];
      if (a !== "0" && a !== "") {
        terms.push(a === "1" ? "x^4" : a === "-1" ? "-x^4" : `${a}*x^4`);
      }
      if (b !== "0" && b !== "") {
        const bSign = parseFloat(b) > 0 && terms.length > 0 ? "+" : "";
        terms.push(`${bSign}${b === "1" ? "x^2" : b === "-1" ? "-x^2" : `${b}*x^2`}`);
      }
      if (c !== "0" && c !== "") {
        const cSign = parseFloat(c) > 0 && terms.length > 0 ? "+" : "";
        terms.push(`${cSign}${c}`);
      }
      formula = terms.join(" ").replace(/\s*\+\s*-/g, " - ").replace(/\s*\+\s*\+/g, " + ").trim();
      if (!formula) formula = "0";
    }
    else if (selectedTemplate === 'rational') {
      const a = tempValues.rational_a || "0";
      const b = tempValues.rational_b || "0";
      const c = tempValues.rational_c || "1";
      const d = tempValues.rational_d || "0";
      
      const numTerms = [];
      if (a !== "0" && a !== "") {
        numTerms.push(a === "1" ? "x" : a === "-1" ? "-x" : `${a}*x`);
      }
      if (b !== "0" && b !== "") {
        const bSign = parseFloat(b) > 0 && numTerms.length > 0 ? "+" : "";
        numTerms.push(`${bSign}${b}`);
      }
      const num = numTerms.join(" ").replace(/\s*\+\s*-/g, " - ").replace(/\s*\+\s*\+/g, " + ").trim();
      
      const denTerms = [];
      if (c !== "0" && c !== "") {
        denTerms.push(c === "1" ? "x" : c === "-1" ? "-x" : `${c}*x`);
      }
      if (d !== "0" && d !== "") {
        const dSign = parseFloat(d) > 0 && denTerms.length > 0 ? "+" : "";
        denTerms.push(`${dSign}${d}`);
      }
      const den = denTerms.join(" ").replace(/\s*\+\s*-/g, " - ").replace(/\s*\+\s*\+/g, " + ").trim();
      
      formula = `(${num || "0"})/(${den || "1"})`;
    }
    else if (selectedTemplate === 'sqrt') {
      const a = tempValues.sqrt_a || "1";
      const b = tempValues.sqrt_b || "0";
      const c = tempValues.sqrt_c || "0";
      
      const insideTerms = [];
      if (a !== "0" && a !== "") {
        insideTerms.push(a === "1" ? "x^2" : a === "-1" ? "-x^2" : `${a}*x^2`);
      }
      if (b !== "0" && b !== "") {
        const bSign = parseFloat(b) > 0 && insideTerms.length > 0 ? "+" : "";
        insideTerms.push(`${bSign}${b === "1" ? "x" : b === "-1" ? "-x" : `${b}*x`}`);
      }
      if (c !== "0" && c !== "") {
        const cSign = parseFloat(c) > 0 && insideTerms.length > 0 ? "+" : "";
        insideTerms.push(`${cSign}${c}`);
      }
      const inside = insideTerms.join(" ").replace(/\s*\+\s*-/g, " - ").replace(/\s*\+\s*\+/g, " + ").trim();
      formula = `sqrt(${inside || "0"})`;
    }
    else if (selectedTemplate === 'log_exp') {
      const a = tempValues.logexp_a || "1";
      const b = tempValues.logexp_b || "1";
      const type = tempValues.logexp_type || "ln";
      const c = tempValues.logexp_c || "0";
      
      let base = "";
      const bPart = b === "1" ? "x" : b === "-1" ? "-x" : `${b}*x`;
      
      if (type === 'ln') {
        base = a === "1" ? `ln(${bPart})` : a === "-1" ? `-ln(${bPart})` : `${a}*ln(${bPart})`;
      } else { // e^x
        base = a === "1" ? `e^(${bPart})` : a === "-1" ? `-e^(${bPart})` : `${a}*e^(${bPart})`;
      }
      
      if (c !== "0" && c !== "") {
        const cSign = parseFloat(c) > 0 ? " + " : " ";
        formula = `${base}${cSign}${c}`;
      } else {
        formula = base;
      }
    }
    
    setFunctionInput(formula);
  }, [selectedTemplate, tempValues]);

  // Rotate loading messages
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      interval = setInterval(() => {
        setLoadingMsgIdx((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 1600);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Load search history and default function on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('bbt_history');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        setHistory(parsed);
      } catch (e) {
        setHistory([]);
      }
    }
    
    // Automatically analyze the initial function
    handleAnalyze("x^3 - 3*x + 2");
  }, []);

  // API Call to analyze function on backend
  const handleAnalyze = async (formulaStr: string) => {
    if (!formulaStr.trim()) return;
    setIsLoading(true);
    setLoadingMsgIdx(0);
    setError(null);
    setAnalysis(null);
    setShowResults(false);
    setUserAnswers({});
    setScore(null);
    setShowConfetti(false);
    
    // Auto-mask clear when switching function
    setMaskedCellIds(new Set());

    try {
      const response = await fetch('/api/analyze-function', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ functionStr: formulaStr.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Có lỗi xảy ra trong quá trình phân tích hàm số.');
      }

      setAnalysis(data);
      setFunctionInput(formulaStr);

      // Save to history
      setHistory(prev => {
        const filtered = prev.filter(f => f !== formulaStr);
        const nextHistory = [formulaStr, ...filtered].slice(0, 15);
        localStorage.setItem('bbt_history', JSON.stringify(nextHistory));
        return nextHistory;
      });

    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi gọi dịch vụ phân tích.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('bbt_history');
  };

  // Quick inputs helper
  const handleAppendSymbol = (symbol: string) => {
    setFunctionInput(prev => prev + symbol);
  };

  // Teacher masking: toggle cell
  const handleToggleMask = (
    cellId: string, 
    originalValue: string, 
    type: 'x' | 'y_prime_point' | 'y_prime_interval' | 'y_value',
    index: number,
    subIndex?: 'left' | 'right' | 'single'
  ) => {
    setMaskedCellIds(prev => {
      const next = new Set(prev);
      if (next.has(cellId)) {
        next.delete(cellId);
      } else {
        next.add(cellId);
      }
      return next;
    });
  };

  // Teacher preset: Auto masking
  const handleApplyAutoMask = (presetType: 'y_prime' | 'y_values' | 'random' | 'clear') => {
    if (!analysis) return;
    
    const { x_points, y_prime, y_row } = analysis;
    const nextMasked = new Set<string>();

    if (presetType === 'y_prime') {
      // Mask all intervals and point signs on y' row
      x_points.forEach((_, i) => {
        if (y_prime.points[i]) {
          nextMasked.add(`y_prime_point-${i}`);
        }
        if (i < x_points.length - 1 && y_prime.intervals[i] !== 'h') {
          nextMasked.add(`y_prime_interval-${i}`);
        }
      });
    } else if (presetType === 'y_values') {
      // Mask all y values
      x_points.forEach((_, i) => {
        const yVal = y_row.points[i];
        if (yVal) {
          if (yVal.type === 'single') {
            nextMasked.add(`y_value-${i}`);
          } else {
            nextMasked.add(`y_value-${i}-left`);
            nextMasked.add(`y_value-${i}-right`);
          }
        }
      });
    } else if (presetType === 'random') {
      // Randomly hide ~35% of all elements
      x_points.forEach((_, i) => {
        // Randomly hide x
        if (i > 0 && i < x_points.length - 1 && Math.random() < 0.3) {
          nextMasked.add(`x-${i}`);
        }
        // Randomly hide y' symbols
        if (y_prime.points[i] && Math.random() < 0.35) {
          nextMasked.add(`y_prime_point-${i}`);
        }
        if (i < x_points.length - 1 && y_prime.intervals[i] !== 'h' && Math.random() < 0.35) {
          nextMasked.add(`y_prime_interval-${i}`);
        }
        // Randomly hide y values
        const yVal = y_row.points[i];
        if (yVal) {
          if (yVal.type === 'single') {
            if (Math.random() < 0.4) nextMasked.add(`y_value-${i}`);
          } else {
            if (Math.random() < 0.4) nextMasked.add(`y_value-${i}-left`);
            if (Math.random() < 0.4) nextMasked.add(`y_value-${i}-right`);
          }
        }
      });
    }

    setMaskedCellIds(nextMasked);
    // Reset any student state
    setShowResults(false);
    setUserAnswers({});
    setScore(null);
    setShowConfetti(false);
  };

  // Student answer update
  const handleAnswerChange = (cellId: string, value: string) => {
    setUserAnswers(prev => ({
      ...prev,
      [cellId]: value
    }));
  };

  // Check answers and score student performance
  const handleGradeQuiz = () => {
    if (!analysis) return;
    
    let correctCount = 0;
    const totalCount = maskedCellIds.size;

    if (totalCount === 0) return;

    maskedCellIds.forEach(cellId => {
      const userAns = (userAnswers[cellId] || '').trim().toLowerCase().replace(/\s+/g, '');
      
      // Determine correct answer
      let correctAns = '';
      if (cellId.startsWith('x-')) {
        const idx = parseInt(cellId.split('-')[1]);
        correctAns = analysis.x_points[idx]?.latex || '';
      } else if (cellId.startsWith('y_prime_point-')) {
        const idx = parseInt(cellId.split('-')[1]);
        correctAns = analysis.y_prime.points[idx] || '';
      } else if (cellId.startsWith('y_prime_interval-')) {
        const idx = parseInt(cellId.split('-')[1]);
        correctAns = analysis.y_prime.intervals[idx] || '';
      } else if (cellId.startsWith('y_value-')) {
        const parts = cellId.split('-');
        const idx = parseInt(parts[1]);
        const yVal = analysis.y_row.points[idx];
        if (yVal) {
          if (yVal.type === 'single') {
            correctAns = yVal.latex;
          } else {
            const sub = parts[2]; // 'left' or 'right'
            correctAns = sub === 'left' ? yVal.latexLeft : yVal.latexRight;
          }
        }
      }

      const cleanCorrect = correctAns.trim().toLowerCase().replace(/\s+/g, '');

      // Check equivalence
      let isCorrect = cleanUserAnsEquivalent(userAns, cleanCorrect);
      if (isCorrect) correctCount++;
    });

    setScore({ correct: correctCount, total: totalCount });
    setShowResults(true);

    if (correctCount === totalCount) {
      setShowConfetti(true);
      // Trigger temporary confetti effect
      setTimeout(() => setShowConfetti(false), 6000);
    }
  };

  // Smart checking for mathematical equivalences
  const cleanUserAnsEquivalent = (userAns: string, correctAns: string) => {
    if (userAns === correctAns) return true;

    // Standardize infinity values
    const infs = ['-\\infty', '-inf', '-vôcực', '-vocuc', '-oo'];
    if (correctAns === '-\\infty' && infs.includes(userAns)) return true;

    const posInfs = ['+\\infty', '\\infty', '+inf', 'inf', '+vôcực', 'vôcực', '+vocuc', 'vocuc', 'oo', '+oo'];
    if (correctAns === '+\\infty' && posInfs.includes(userAns)) return true;

    // Standardize square root
    if (correctAns.includes('\\sqrt')) {
      const digit = correctAns.match(/\d+/)?.[0];
      if (digit && (userAns === `sqrt(${digit})` || userAns === `can${digit}` || userAns === `căn${digit}` || userAns === `sqrt${digit}`)) {
        return true;
      }
    }

    // Standardize fraction
    if (correctAns.includes('\\frac')) {
      const match = correctAns.match(/\\frac\{(\d+)\}\{(\d+)\}/);
      if (match && match[1] && match[2]) {
        if (userAns === `${match[1]}/${match[2]}`) return true;
      }
    }

    return false;
  };

  const handleResetQuiz = () => {
    setUserAnswers({});
    setShowResults(false);
    setScore(null);
    setShowConfetti(false);
  };

  // Generate Masked LaTeX for teacher paper export
  const getMaskedLatexCode = () => {
    if (!analysis) return '';
    return getMaskedLatex(analysis.latex_code, analysis, maskedCellIds, placeholderStyle);
  };

  const handleCopyCode = (isFull: boolean) => {
    const code = isFull ? analysis?.latex_code : getMaskedLatexCode();
    if (!code) return;
    
    navigator.clipboard.writeText(code);
    if (isFull) {
      setIsCopiedFull(true);
      setTimeout(() => setIsCopiedFull(false), 2000);
    } else {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // Custom Latex parser which replaces masked values
  const getMaskedLatex = (
    latex: string, 
    analysisData: FunctionAnalysis, 
    maskedIds: Set<string>, 
    style: 'fbox' | 'dots' | 'question'
  ): string => {
    if (!latex) return '';
    let result = latex;

    const getMaskStr = (original: string) => {
      if (style === 'fbox') return `\\fbox{${original ? '?' : ' '}}`;
      if (style === 'dots') return '\\dots';
      return '?';
    };

    // 1. Mask X points
    const initRegex = /(\\tkzTabInit\[[^\]]*\]\{[^\}]*\}\{)([^\}]*)(\})/g;
    result = result.replace(initRegex, (match, before, itemsStr, after) => {
      const items = itemsStr.split(',').map(s => s.trim());
      const maskedItems = items.map((item, idx) => {
        if (maskedIds.has(`x-${idx}`)) {
          return getMaskStr(item);
        }
        return item;
      });
      return `${before}${maskedItems.join(', ')}${after}`;
    });

    // 2. Mask Y' signs
    const lineRegex = /(\\tkzTabLine\{)([^\}]*)(\})/g;
    result = result.replace(lineRegex, (match, before, itemsStr, after) => {
      const items = itemsStr.split(',').map(s => s.trim());
      const maskedItems = items.map((item, idx) => {
        if (idx === 0) return item;
        if (idx % 2 === 1) {
          const intervalIdx = Math.floor(idx / 2);
          if (maskedIds.has(`y_prime_interval-${intervalIdx}`)) {
            return getMaskStr(item);
          }
        } else {
          const pointIdx = Math.floor(idx / 2);
          if (maskedIds.has(`y_prime_point-${pointIdx}`)) {
            return getMaskStr(item);
          }
        }
        return item;
      });
      return `${before}${maskedItems.join(', ')}${after}`;
    });

    // 3. Mask Y values
    const varRegex = /(\\tkzTabVar\{)([^\}]*)(\})/g;
    result = result.replace(varRegex, (match, before, itemsStr, after) => {
      const items = itemsStr.split(',').map(s => s.trim());
      const maskedItems = items.map((item, idx) => {
        const parts = item.split('/');
        if (parts.length < 2) return item;
        const prefix = parts[0].trim();
        const valuePart = parts.slice(1).join('/').trim();
        
        if (prefix.includes('D')) {
          const subParts = valuePart.split('/');
          if (subParts.length >= 2) {
            const leftVal = subParts[0].trim();
            const rightVal = subParts[1].trim();
            const leftMasked = maskedIds.has(`y_value-${idx}-left`) ? getMaskStr(leftVal) : leftVal;
            const rightMasked = maskedIds.has(`y_value-${idx}-right`) ? getMaskStr(rightVal) : rightVal;
            return `${prefix}/ ${leftMasked} / ${rightMasked}`;
          } else {
            if (maskedIds.has(`y_value-${idx}-left`) || maskedIds.has(`y_value-${idx}-right`)) {
              return `${prefix}/ ${getMaskStr(valuePart)}`;
            }
          }
        } else {
          if (maskedIds.has(`y_value-${idx}`)) {
            return `${prefix}/ ${getMaskStr(valuePart)}`;
          }
        }
        return item;
      });
      return `${before}${maskedItems.join(', ')}${after}`;
    });

    return result;
  };

  return (
    <div className="flex flex-col min-h-screen text-slate-800 bg-slate-50 font-sans">
      
      {/* 1. TOP HEADER BRANDBAR */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-200 py-3.5 px-4 md:px-6 z-30 flex items-center justify-between no-print shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-md shadow-indigo-100 flex items-center justify-center">
            <Calculator className="w-5.5 h-5.5" />
          </div>
          <div>
            <h1 className="font-display font-bold text-base md:text-lg tracking-tight text-slate-900 flex items-center gap-2">
              Bảng Biến Thiên <span className="text-xs font-mono bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded-md">Pro v3.5</span>
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">
              Phân tích khảo sát hàm số, tự động tạo Bảng biến thiên, xuất LaTeX & Bài tập tương tác
            </p>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2">
          {/* Global Role Switcher */}
          <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 mr-2">
            <button
              onClick={() => {
                setRole('student');
                setMode('view');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                role === 'student' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Học Sinh
            </button>
            <button
              onClick={() => {
                setRole('teacher');
                setMode('teacher');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                role === 'teacher' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Giáo Viên
            </button>
          </div>

          {role === 'student' && (
            <button
              onClick={() => setShowHistory(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                showHistory 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-850'
              }`}
              title="Bật/Tắt hiển thị lịch sử khảo sát"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lịch sử</span>
            </button>
          )}

          {analysis && role === 'teacher' && (
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                onClick={() => setShowGraph(prev => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  showGraph 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-850'
                }`}
                title="Bật/Tắt hiển thị đồ thị tương quan phía trên bảng biến thiên"
              >
                {showGraph ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Đồ thị</span>
              </button>
              <button
                onClick={() => setShowExplanation(prev => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  showExplanation 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-850'
                }`}
                title="Bật/Tắt hiển thị cột lời giải chi tiết từng bước ở bên phải"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Bài giải</span>
              </button>
            </div>
          )}

          {role === 'teacher' && (
            <button 
              onClick={() => window.print()}
              disabled={!analysis}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              title="In đề bài hoặc trang này"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">In Bài Tập</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. MAIN LAYOUT WORKSPACE */}
      <div className="flex-1 flex flex-col lg:flex-row items-stretch">
        
        {/* Left column sidebar templates */}
        {((role === 'teacher') || (role === 'student' && showHistory)) && (
          <AppSidebar
            history={history}
            onSelectFunction={handleAnalyze}
            onClearHistory={handleClearHistory}
            activeFunction={functionInput}
            role={role}
          />
        )}

        {/* Right column main content panel */}
        <main className={`flex-1 p-4 md:p-6 lg:p-8 flex flex-col gap-6 ${showExplanation ? 'max-w-7xl' : 'max-w-5xl'} mx-auto w-full transition-all duration-300`}>
          
          {/* FUNCTION INPUT CARD (NO-PRINT) */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm no-print flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-display font-bold text-slate-800 text-base flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                Khảo Sát & Vẽ Bảng Biến Thiên Hàm Số
              </h2>
              <p className="text-xs text-slate-400">
                Nhập công thức toán học tự do hoặc chọn một mẫu hàm số trực quan dưới đây để tự điền các hệ số dễ dàng.
              </p>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleAnalyze(functionInput);
              }}
              className="flex flex-col sm:flex-row gap-2.5 mt-1"
            >
              <div className="flex-grow">
                <MathWYSIWYMInput
                  inputRef={inputRef}
                  value={functionInput}
                  onChange={(val) => {
                    setFunctionInput(val);
                    setSelectedTemplate(null);
                  }}
                  onSubmit={() => {
                    if (functionInput.trim()) {
                      handleAnalyze(functionInput);
                    }
                  }}
                  placeholder="Nhập hàm số, ví dụ: (2x - 1)/(x + 1) hoặc x^3 - 3*x + 2"
                  disabled={isLoading}
                />
              </div>
              
              <button
                type="submit"
                disabled={isLoading || !functionInput.trim()}
                className="h-[56px] px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-100 hover:shadow-indigo-200 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto w-full shrink-0"
              >
                {isLoading ? 'Đang phân tích...' : 'Phân Tích'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* INTUITIVE MATH TEMPLATE BUILDER (Desmos/GeoGebra Style) */}
            <div className="border-t border-slate-100 pt-4 mt-2">
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold tracking-wide text-slate-500 uppercase select-none">
                  Trình dựng công thức trực quan (Chọn mẫu điền khuyết)
                </span>
                
                {/* Preset select tabs */}
                <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl w-fit">
                  <button
                    type="button"
                    onClick={() => setSelectedTemplate(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedTemplate === null
                        ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/50'
                        : 'text-slate-600 hover:bg-slate-200/50'
                    }`}
                  >
                    Tự nhập tự do
                  </button>
                  {[
                    { id: 'cubic', label: 'Hàm Bậc 3' },
                    { id: 'quartic', label: 'Trùng Phương' },
                    { id: 'rational', label: 'Nhất Biến (Bậc 1/1)' },
                    { id: 'sqrt', label: 'Căn Thức' },
                    { id: 'log_exp', label: 'Mũ & Logarit' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedTemplate(tab.id as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        selectedTemplate === tab.id
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-200/50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Interactive visual slots form */}
                {selectedTemplate && (
                  <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl flex flex-col items-center justify-center gap-3 animate-in fade-in zoom-in-95 duration-200">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      Hãy thay đổi các giá trị ở ô trống bên dưới để tạo hàm số của bạn
                    </span>
                    
                    {/* Cubic Layout */}
                    {selectedTemplate === 'cubic' && (
                      <div className="flex flex-wrap items-center justify-center gap-2 text-base font-bold text-slate-700 font-sans">
                        <span className="text-indigo-600 italic font-mono">y</span>
                        <span>=</span>
                        <input
                          type="text"
                          value={tempValues.cubic_a}
                          onChange={(e) => updateTempValue('cubic_a', e.target.value)}
                          className="w-12 h-9 text-center bg-white border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                          placeholder="a"
                        />
                        <span>x³</span>
                        <span className="text-slate-400 font-normal">+</span>
                        <input
                          type="text"
                          value={tempValues.cubic_b}
                          onChange={(e) => updateTempValue('cubic_b', e.target.value)}
                          className="w-12 h-9 text-center bg-white border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                          placeholder="b"
                        />
                        <span>x²</span>
                        <span className="text-slate-400 font-normal">+</span>
                        <input
                          type="text"
                          value={tempValues.cubic_c}
                          onChange={(e) => updateTempValue('cubic_c', e.target.value)}
                          className="w-12 h-9 text-center bg-white border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                          placeholder="c"
                        />
                        <span>x</span>
                        <span className="text-slate-400 font-normal">+</span>
                        <input
                          type="text"
                          value={tempValues.cubic_d}
                          onChange={(e) => updateTempValue('cubic_d', e.target.value)}
                          className="w-12 h-9 text-center bg-white border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                          placeholder="d"
                        />
                      </div>
                    )}

                    {/* Quartic Layout */}
                    {selectedTemplate === 'quartic' && (
                      <div className="flex flex-wrap items-center justify-center gap-2 text-base font-bold text-slate-700 font-sans">
                        <span className="text-indigo-600 italic font-mono">y</span>
                        <span>=</span>
                        <input
                          type="text"
                          value={tempValues.quartic_a}
                          onChange={(e) => updateTempValue('quartic_a', e.target.value)}
                          className="w-12 h-9 text-center bg-white border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                          placeholder="a"
                        />
                        <span>x⁴</span>
                        <span className="text-slate-400 font-normal">+</span>
                        <input
                          type="text"
                          value={tempValues.quartic_b}
                          onChange={(e) => updateTempValue('quartic_b', e.target.value)}
                          className="w-12 h-9 text-center bg-white border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                          placeholder="b"
                        />
                        <span>x²</span>
                        <span className="text-slate-400 font-normal">+</span>
                        <input
                          type="text"
                          value={tempValues.quartic_c}
                          onChange={(e) => updateTempValue('quartic_c', e.target.value)}
                          className="w-12 h-9 text-center bg-white border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                          placeholder="c"
                        />
                      </div>
                    )}

                    {/* Rational Layout */}
                    {selectedTemplate === 'rational' && (
                      <div className="flex items-center gap-3 text-base font-bold text-slate-700 font-sans">
                        <span className="text-indigo-600 italic font-mono">y</span>
                        <span>=</span>
                        <div className="flex flex-col items-center gap-1.5">
                          {/* Numerator */}
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={tempValues.rational_a}
                              onChange={(e) => updateTempValue('rational_a', e.target.value)}
                              className="w-10 h-8 text-center bg-white border border-slate-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                              placeholder="a"
                            />
                            <span className="text-sm font-bold">x</span>
                            <span className="text-slate-400 font-normal">+</span>
                            <input
                              type="text"
                              value={tempValues.rational_b}
                              onChange={(e) => updateTempValue('rational_b', e.target.value)}
                              className="w-10 h-8 text-center bg-white border border-slate-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                              placeholder="b"
                            />
                          </div>
                          {/* Fraction Line */}
                          <div className="w-full h-[2px] bg-slate-300 rounded"></div>
                          {/* Denominator */}
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={tempValues.rational_c}
                              onChange={(e) => updateTempValue('rational_c', e.target.value)}
                              className="w-10 h-8 text-center bg-white border border-slate-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                              placeholder="c"
                            />
                            <span className="text-sm font-bold">x</span>
                            <span className="text-slate-400 font-normal">+</span>
                            <input
                              type="text"
                              value={tempValues.rational_d}
                              onChange={(e) => updateTempValue('rational_d', e.target.value)}
                              className="w-10 h-8 text-center bg-white border border-slate-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                              placeholder="d"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sqrt Layout */}
                    {selectedTemplate === 'sqrt' && (
                      <div className="flex items-center gap-2 text-base font-bold text-slate-700 font-sans">
                        <span className="text-indigo-600 italic font-mono">y</span>
                        <span>=</span>
                        <div className="flex items-stretch bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 shadow-sm">
                          <span className="text-xl font-light text-slate-400 mr-1 select-none">√</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-300 font-light select-none">(</span>
                            <input
                              type="text"
                              value={tempValues.sqrt_a}
                              onChange={(e) => updateTempValue('sqrt_a', e.target.value)}
                              className="w-10 h-8 text-center bg-slate-50 border border-slate-200 rounded-md text-xs font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                              placeholder="a"
                            />
                            <span>x²</span>
                            <span className="text-slate-400 font-normal">+</span>
                            <input
                              type="text"
                              value={tempValues.sqrt_b}
                              onChange={(e) => updateTempValue('sqrt_b', e.target.value)}
                              className="w-10 h-8 text-center bg-slate-50 border border-slate-200 rounded-md text-xs font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                              placeholder="b"
                            />
                            <span>x</span>
                            <span className="text-slate-400 font-normal">+</span>
                            <input
                              type="text"
                              value={tempValues.sqrt_c}
                              onChange={(e) => updateTempValue('sqrt_c', e.target.value)}
                              className="w-10 h-8 text-center bg-slate-50 border border-slate-200 rounded-md text-xs font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                              placeholder="c"
                            />
                            <span className="text-slate-300 font-light select-none">)</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Log Exp Layout */}
                    {selectedTemplate === 'log_exp' && (
                      <div className="flex flex-wrap items-center justify-center gap-2 text-base font-bold text-slate-700 font-sans">
                        <span className="text-indigo-600 italic font-mono">y</span>
                        <span>=</span>
                        <input
                          type="text"
                          value={tempValues.logexp_a}
                          onChange={(e) => updateTempValue('logexp_a', e.target.value)}
                          className="w-10 h-8 text-center bg-white border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                          placeholder="a"
                        />
                        {/* Selector for ln vs e^ */}
                        <select
                          value={tempValues.logexp_type}
                          onChange={(e) => updateTempValue('logexp_type', e.target.value)}
                          className="h-8 px-2 bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 outline-none"
                        >
                          <option value="ln">ln(</option>
                          <option value="e">e^(</option>
                        </select>
                        <input
                          type="text"
                          value={tempValues.logexp_b}
                          onChange={(e) => updateTempValue('logexp_b', e.target.value)}
                          className="w-10 h-8 text-center bg-white border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                          placeholder="b"
                        />
                        <span>x</span>
                        <span>)</span>
                        <span className="text-slate-400 font-normal">+</span>
                        <input
                          type="text"
                          value={tempValues.logexp_c}
                          onChange={(e) => updateTempValue('logexp_c', e.target.value)}
                          className="w-10 h-8 text-center bg-white border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-100 outline-none"
                          placeholder="c"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* SKELETON / LOADING LOADER PANEL */}
          {isLoading && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm flex flex-col items-center justify-center gap-6 py-16 no-print">
              <div className="relative flex items-center justify-center">
                {/* Visual radial pulsing indicator */}
                <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
                <Calculator className="absolute w-6 h-6 text-indigo-500 animate-pulse" />
              </div>
              
              <div className="flex flex-col items-center gap-1.5 text-center">
                <h3 className="font-display font-bold text-slate-800 text-base">
                  AI đang giải toán...
                </h3>
                
                {/* Dynamic cycled loading messages */}
                <p className="text-sm text-slate-500 h-6 font-medium animate-pulse text-indigo-600">
                  {LOADING_MESSAGES[loadingMsgIdx]}
                </p>
                
                <p className="text-xs text-slate-400 mt-2">
                  Trình phân tích toán học cao cấp đang khảo sát hàm số, vui lòng đợi trong giây lát.
                </p>
              </div>
            </div>
          )}

          {/* ERROR STATUS CARD */}
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 shadow-sm no-print flex gap-3.5 items-start">
              <AlertTriangle className="w-6 h-6 text-rose-500 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-rose-800 text-sm md:text-base">Không thể phân tích hàm số</h3>
                <p className="text-xs md:text-sm text-rose-600 mt-1">{error}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleAnalyze(functionInput)}
                    className="px-3 py-1.5 bg-rose-600 text-white hover:bg-rose-700 rounded-lg text-xs font-semibold transition-all"
                  >
                    Thử lại
                  </button>
                  <button
                    onClick={() => setFunctionInput("x^3 - 3*x + 2")}
                    className="px-3 py-1.5 bg-white border border-rose-200 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-semibold transition-all"
                  >
                    Dùng hàm bậc 3 mặc định
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CORE DYNAMIC MATH DATA DASHBOARD */}
          {analysis && !isLoading && (
            <div className={`grid grid-cols-1 ${showExplanation ? 'lg:grid-cols-5' : 'grid-cols-1'} gap-6 md:gap-8`}>
              
              {/* LEFT COLUMN: SURVEY CARDS, BBT & CODE EXPORTS */}
              <div className={`${showExplanation ? 'lg:col-span-3' : ''} flex flex-col gap-6`}>
              
              {/* TABLE OF VARIATIONS MAIN BOARD */}
              <section className="flex flex-col gap-4">
                
                {/* Mode Selector Tabs (No-Print) */}
                {role === 'teacher' && (
                  <div className="flex items-center justify-between no-print border-b border-slate-200 pb-1">
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => {
                          setMode('view');
                          setScore(null);
                          setShowResults(false);
                        }}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                          mode === 'view'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Xem Bảng Biến Thiên
                      </button>
                      
                      <button
                        onClick={() => {
                          setMode('teacher');
                          setScore(null);
                          setShowResults(false);
                        }}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                          mode === 'teacher'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Settings className="w-3.5 h-3.5" />
                        Thiết Kế Đề Bài
                      </button>
                      
                      <button
                        onClick={() => {
                          setMode('student');
                          // Auto apply a random mask if none is configured, to keep it fun
                          if (maskedCellIds.size === 0) {
                            handleApplyAutoMask('random');
                          }
                        }}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                          mode === 'student'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <GraduationCap className="w-3.5 h-3.5" />
                        Làm Thử Bài Tập
                      </button>
                    </div>

                    {/* Indicator info badges */}
                    <div className="text-xs font-semibold text-slate-400 hidden sm:block">
                      {mode === 'teacher' && (
                        <span className="text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <Lightbulb className="w-3.5 h-3.5 animate-pulse" />
                          Bấm trực tiếp vào các ô bên dưới để "đục lỗ" đề bài
                        </span>
                      )}
                      {mode === 'student' && (
                        <span className="text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <HelpCircle className="w-3.5 h-3.5" />
                          Điền khuyết vào các ô màu cam bên dưới và nộp bài
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* VISUAL BBT BOARD CONTAINER */}
                <div className="relative">
                  <VisualBBT
                    analysis={analysis}
                    isTeacherMode={mode === 'teacher'}
                    isStudentMode={mode === 'student'}
                    maskedCellIds={maskedCellIds}
                    userAnswers={userAnswers}
                    showResults={showResults}
                    onToggleMask={handleToggleMask}
                    onAnswerChange={handleAnswerChange}
                    showGraph={showGraph}
                  />
                  
                  {/* Printed footer signature under table if printed */}
                  <div className="hidden print:block text-right text-[10px] text-slate-400 italic mt-3">
                    Đề thi được tạo tự động bởi Trình Tạo Bảng Biến Thiên Pro.
                  </div>
                </div>

                {/* CONGRATULATIONS CONFETTI MODAL OVERLAY */}
                {showConfetti && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-2 flex items-center justify-between no-print shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-emerald-500 text-white p-2 rounded-lg">
                        <Sparkles className="w-5 h-5 animate-spin" />
                      </div>
                      <div>
                        <h4 className="font-bold text-emerald-950 text-sm">Tuyệt vời! Hoàn thành xuất sắc 100%!</h4>
                        <p className="text-xs text-emerald-700">Tất cả các mốc hoành độ, đạo hàm và giá trị biến thiên đều chính xác tuyệt đối.</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* STUDENT MODE SCORE / ACTIONS CARD (NO-PRINT) */}
                {mode === 'student' && maskedCellIds.size > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 no-print shadow-inner">
                    <div className="flex flex-col gap-0.5 text-center sm:text-left">
                      <span className="text-xs font-bold text-slate-400 uppercase">Trạng thái bài kiểm tra</span>
                      <p className="text-sm font-semibold text-slate-700">
                        {showResults ? (
                          <span>
                            Kết quả: <strong className="text-indigo-600 text-base">{score?.correct}/{score?.total}</strong> câu đúng.
                          </span>
                        ) : (
                          <span>Vui lòng điền toàn bộ <strong className="text-amber-600">{maskedCellIds.size}</strong> ô trống phía trên.</span>
                        )}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleResetQuiz}
                        className="px-4 h-10 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-sm transition-all flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Làm lại
                      </button>
                      
                      {!showResults ? (
                        <button
                          onClick={handleGradeQuiz}
                          disabled={Object.keys(userAnswers).length === 0}
                          className="px-5 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm shadow-md transition-all flex items-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          Nộp Bài & Chấm Điểm
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setShowResults(false);
                            setScore(null);
                          }}
                          className="px-5 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md transition-all flex items-center gap-1.5"
                        >
                          Hiển thị lại bài làm
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* TEACHER MODE ACTION TOOLS / LATEX GENERATOR */}
                {mode === 'teacher' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-2 no-print">
                    
                    {/* Hướng dẫn và Presets */}
                    <div className="md:col-span-1 bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col gap-3.5">
                      <div className="flex flex-col gap-0.5">
                        <h4 className="font-display font-bold text-sm text-slate-800">Cấu hình Đề Bài khuyết</h4>
                        <p className="text-xs text-slate-400">Chọn nhanh mẫu khuyết có sẵn hoặc tùy biến ký hiệu</p>
                      </div>

                      {/* Presets Button Group */}
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() => handleApplyAutoMask('y_prime')}
                          className="w-full text-left px-3 py-1.5 bg-white border border-slate-200 hover:bg-indigo-50/50 hover:border-indigo-100 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-between transition-all"
                        >
                          <span>Giấu toàn bộ dấu y'</span>
                          <ChevronRight className="w-3 h-3 text-slate-400" />
                        </button>
                        <button
                          onClick={() => handleApplyAutoMask('y_values')}
                          className="w-full text-left px-3 py-1.5 bg-white border border-slate-200 hover:bg-indigo-50/50 hover:border-indigo-100 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-between transition-all"
                        >
                          <span>Giấu toàn bộ cực trị y</span>
                          <ChevronRight className="w-3 h-3 text-slate-400" />
                        </button>
                        <button
                          onClick={() => handleApplyAutoMask('random')}
                          className="w-full text-left px-3 py-1.5 bg-white border border-slate-200 hover:bg-indigo-50/50 hover:border-indigo-100 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-between transition-all"
                        >
                          <span>Giấu ngẫu nhiên hỗn hợp</span>
                          <ChevronRight className="w-3 h-3 text-slate-400" />
                        </button>
                        <button
                          onClick={() => handleApplyAutoMask('clear')}
                          className="w-full text-left px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all justify-center"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Bỏ ẩn toàn bộ bảng
                        </button>
                      </div>

                      {/* Ký hiệu placeholder trong đề thi */}
                      <div className="flex flex-col gap-1.5 border-t border-slate-200 pt-3 mt-1">
                        <span className="text-xs font-bold text-slate-500">Ký hiệu khuyết LaTeX:</span>
                        <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-lg border border-slate-200">
                          <button
                            onClick={() => setPlaceholderStyle('fbox')}
                            className={`px-2 py-1 text-[11px] font-bold rounded ${
                              placeholderStyle === 'fbox' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 text-slate-600'
                            }`}
                          >
                            {"\\fbox{?}"}
                          </button>
                          <button
                            onClick={() => setPlaceholderStyle('dots')}
                            className={`px-2 py-1 text-[11px] font-bold rounded ${
                              placeholderStyle === 'dots' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 text-slate-600'
                            }`}
                          >
                            {"\\dots"}
                          </button>
                          <button
                            onClick={() => setPlaceholderStyle('question')}
                            className={`px-2 py-1 text-[11px] font-bold rounded ${
                              placeholderStyle === 'question' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 text-slate-600'
                            }`}
                          >
                            ?
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Masked LaTeX Export Display Panel */}
                    <div className="md:col-span-2 bg-slate-900 text-slate-200 rounded-2xl p-5 flex flex-col gap-3 shadow-md border border-slate-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileCode className="w-5 h-5 text-indigo-400" />
                          <h4 className="font-display font-bold text-sm text-white">Mã LaTeX (Đề bài khuyết)</h4>
                        </div>
                        
                        <button
                          onClick={() => handleCopyCode(false)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs text-indigo-200 font-semibold rounded-lg flex items-center gap-1 transition-all border border-slate-700"
                        >
                          {isCopied ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              Đã sao chép!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Sao chép mã
                            </>
                          )}
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-400 leading-normal -mt-1 select-none">
                        Mã LaTeX tkz-tab này đã tự động thế các ô bạn đã đục lỗ bằng ký hiệu khuyết đã chọn, sẵn sàng dán trực tiếp vào đề thi Overleaf của bạn.
                      </p>

                      <div className="flex-grow bg-slate-950 rounded-xl p-3 border border-slate-800 overflow-auto max-h-48 font-mono text-[11px] leading-relaxed text-indigo-300">
                        <pre>{getMaskedLatexCode()}</pre>
                      </div>
                    </div>

                  </div>
                )}

              </section>

              {/* DYNAMIC LATEX EXPORT PANEL (STANDARD FULL CODE) */}
              {role === 'teacher' && (
                <section className="bg-slate-900 text-slate-200 rounded-2xl p-5 md:p-6 shadow-md border border-slate-800 no-print">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                        <FileCode className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-sm md:text-base text-white">
                          Mã LaTeX Gốc (Đầy đủ)
                        </h3>
                        <p className="text-xs text-slate-400">
                          Vẽ bảng biến thiên hoàn chỉnh sử dụng thư viện <code className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded font-mono text-[10px]">tkz-tab</code>
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleCopyCode(true)}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold rounded-lg text-white flex items-center gap-1 shadow-md shadow-indigo-950/20 active:scale-95 transition-all"
                    >
                      {isCopiedFull ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-white" />
                          Đã sao chép!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Sao chép mã gốc
                        </>
                      )}
                    </button>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-xl font-mono text-[11px] md:text-xs text-indigo-300/90 overflow-x-auto max-h-56 leading-relaxed border border-slate-850">
                    <pre>{analysis.latex_code}</pre>
                  </div>

                  <div className="mt-3.5 bg-indigo-950/20 border border-indigo-900/30 p-3 rounded-lg text-xs text-indigo-300 flex items-start gap-2 select-none leading-relaxed">
                    <span className="text-indigo-400 mt-0.5"><Lightbulb className="w-4 h-4 flex-shrink-0" /></span>
                    <p>
                      <strong>Mẹo sử dụng LaTeX:</strong> Hãy đảm bảo bạn đã khai báo gói gói lệnh <code className="bg-indigo-900/40 text-indigo-100 px-1 py-0.5 rounded font-mono">{"\\usepackage{tkz-tab}"}</code> trong phần Khai báo (Preamble) của tài liệu LaTeX trước khi sử dụng đoạn mã trên.
                    </p>
                  </div>
                </section>
              )}

              </div>

              {/* RIGHT COLUMN: STEP-BY-STEP MATHEMATICAL EXPLANATION */}
              {showExplanation && (
                <div className="lg:col-span-2 flex flex-col gap-6 h-fit lg:sticky lg:top-[90px]">
                  <ExplanationPanel 
                    steps={analysis.explanation_steps} 
                    bbtElement={
                      <div className="border border-indigo-100 rounded-xl overflow-hidden bg-white shadow-sm mt-3 mb-1">
                        <VisualBBT
                          analysis={analysis}
                          isTeacherMode={false}
                          isStudentMode={false}
                          maskedCellIds={new Set()}
                          userAnswers={{}}
                          showResults={false}
                          onToggleMask={() => {}}
                          onAnswerChange={() => {}}
                          showGraph={false}
                        />
                      </div>
                    }
                  />
                </div>
              )}

            </div>
          )}

        </main>

      </div>

    </div>
  );
}

// Inline helper components
interface FormulaProps {
  latex: string;
}

function VisualBBTFormula({ latex }: FormulaProps) {
  return <MathLaTeX math={latex} block={false} />;
}

// Small helper chevron icon
function ChevronRight({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
