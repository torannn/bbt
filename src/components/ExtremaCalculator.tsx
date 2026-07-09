/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import * as math from 'mathjs';
import { FunctionAnalysis } from '../types';
import { MathLaTeX } from './MathLaTeX';
import { renderRichText } from './ExplanationPanel';
import { toExactLatex } from '../lib/cas';
import { Calculator, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Sparkles, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ExtremaCalculatorProps {
  analysis: FunctionAnalysis;
  onHighlightRange: (
    range: [number, number] | null,
    maxPts: { x: number; y: number }[],
    minPts: { x: number; y: number }[]
  ) => void;
}

export function ExtremaCalculator({ analysis, onHighlightRange }: ExtremaCalculatorProps) {
  const [lowerBound, setLowerBound] = useState<string>('');
  const [upperBound, setUpperBound] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState<boolean>(true);

  const [result, setResult] = useState<{
    a: number;
    b: number;
    maxVal: number | null;
    maxAt: number[] | null;
    minVal: number | null;
    minAt: number[] | null;
    maxExists: boolean;
    minExists: boolean;
    candidates: { x: number; y: number; label: string }[];
    steps: { title: string; content: string }[];
  } | null>(null);

  // Clear result when function changes
  useEffect(() => {
    setLowerBound('');
    setUpperBound('');
    setError(null);
    setResult(null);
    onHighlightRange(null, [], []);
  }, [analysis?.functionStr]);

  // Handle calculation
  const handleCalculate = () => {
    setError(null);
    setResult(null);
    onHighlightRange(null, null, null);

    let a = -Infinity;
    let b = Infinity;

    // 1. Parse lower bound
    if (lowerBound.trim()) {
      try {
        const parsed = math.evaluate(lowerBound.trim());
        if (typeof parsed === 'number' && !isNaN(parsed)) {
          a = parsed;
        } else {
          throw new Error();
        }
      } catch {
        setError('Cận dưới không hợp lệ. Hãy nhập số hoặc biểu thức (ví dụ: -2, 1/2, sqrt(2))');
        return;
      }
    }

    // 2. Parse upper bound
    if (upperBound.trim()) {
      try {
        const parsed = math.evaluate(upperBound.trim());
        if (typeof parsed === 'number' && !isNaN(parsed)) {
          b = parsed;
        } else {
          throw new Error();
        }
      } catch {
        setError('Cận trên không hợp lệ. Hãy nhập số hoặc biểu thức (ví dụ: 5, 2/3, 2*pi)');
        return;
      }
    }

    if (a > b) {
      setError('Cận dưới phải nhỏ hơn hoặc bằng cận trên.');
      return;
    }

    // 3. Compile function
    let evalFn: math.EvalFunction;
    try {
      evalFn = math.compile(analysis.functionStr);
    } catch {
      setError('Không thể biên dịch hàm số để tính toán.');
      return;
    }

    const evalY = (xVal: number) => {
      try {
        const val = evalFn.evaluate({ x: xVal });
        return (typeof val === 'number' && !isNaN(val)) ? val : NaN;
      } catch {
        return NaN;
      }
    };

    // Verify if function is defined on the entire interval
    const samplesCount = 20;
    let hasNaN = false;
    if (a !== -Infinity && b !== Infinity) {
      for (let i = 0; i <= samplesCount; i++) {
        const t = i / samplesCount;
        const xVal = a + t * (b - a);
        const isPole = (analysis.poles || []).some(p => Math.abs(p - xVal) < 1e-4);
        if (!isPole) {
          const yVal = evalY(xVal);
          if (isNaN(yVal)) {
            hasNaN = true;
            break;
          }
        }
      }
    }
    if (hasNaN) {
      setError('Hàm số không xác định trên toàn bộ khoảng khảo sát được chọn.');
      return;
    }

    // 4. Identify poles (discontinuities) inside the interval
    const polesInInterval = (analysis.poles || []).filter(p => p >= a && p <= b);
    
    // Check if bounds themselves are poles
    const lowerIsPole = (analysis.poles || []).some(p => Math.abs(p - a) < 1e-4);
    const upperIsPole = (analysis.poles || []).some(p => Math.abs(p - b) < 1e-4);

    if (lowerIsPole || upperIsPole) {
      setError('Cận khảo sát không được trùng với điểm gián đoạn (tiệm cận đứng) của hàm số.');
      return;
    }

    let maxExists = true;
    let minExists = true;
    const steps: { title: string; content: string }[] = [];
    const candidates: { x: number; y: number; label: string }[] = [];

    // Step 1: Interval declaration
    const intervalLatex = (a === -Infinity && b === Infinity) ? '\\mathbb{R}' 
      : (a === -Infinity) ? `(-\\infty; ${toExactLatex(b)}]`
      : (b === Infinity) ? `[${toExactLatex(a)}; +\\infty)`
      : `[${toExactLatex(a)}; ${toExactLatex(b)}]`;

    steps.push({
      title: 'Bước 1: Xác định tập khảo sát',
      content: `Khảo sát giá trị lớn nhất và nhỏ nhất của hàm số trên miền $I = ${intervalLatex}$.`
    });

    // Step 2: Critical points in interval
    const critsInInterval = (analysis.criticals || []).filter(c => c > a && c < b);
    
    let critText = '';
    if (critsInInterval.length > 0) {
      const critLatexList = critsInInterval.map(c => `x = ${toExactLatex(c)}`).join('; ');
      critText = `Đạo hàm $y' = 0 \\Leftrightarrow x \\in \\{${critLatexList}\\}$ thuộc miền khảo sát.`;
    } else {
      critText = `Phương trình đạo hàm $y' = 0$ không có nghiệm thuộc khoảng đang xét.`;
    }
    steps.push({
      title: "Bước 2: Tìm các điểm tới hạn (nghiệm y' = 0)",
      content: critText
    });

    // Step 3: Check pole limits
    if (polesInInterval.length > 0) {
      let poleText = `Miền đang xét chứa điểm gián đoạn: `;
      polesInInterval.forEach(p => {
        const pL = toExactLatex(p);
        const yLeft = evalY(p - 1e-5);
        const yRight = evalY(p + 1e-5);

        poleText += `$x = ${pL}$ (Tiệm cận đứng).\n`;
        if (yLeft > 1e3 || yRight > 1e3) {
          maxExists = false;
          poleText += `* Do $\\lim_{x \\to ${pL}} y = +\\infty$, hàm số tiến tới vô cùng lớn nên **không tồn tại GTLN**.\n`;
        }
        if (yLeft < -1e3 || yRight < -1e3) {
          minExists = false;
          poleText += `* Do $\\lim_{x \\to ${pL}} y = -\\infty$, hàm số tiến tới vô cùng nhỏ nên **không tồn tại GTNN**.\n`;
        }
      });
      steps.push({
        title: 'Bước 3: Đánh giá tại các điểm gián đoạn',
        content: poleText.trim()
      });
    }

    // Step 4: Evaluate endpoints & critical points
    const evalPoints: { x: number; label: string }[] = [];
    if (a !== -Infinity) evalPoints.push({ x: a, label: 'đầu mút $a$' });
    if (b !== -Infinity) evalPoints.push({ x: b, label: 'đầu mút $b$' });
    critsInInterval.forEach(c => {
      evalPoints.push({ x: c, label: `điểm tới hạn $x = ${toExactLatex(c)}$` });
    });

    // Remove duplicates
    const uniquePoints = evalPoints.filter((v, i, self) => self.findIndex(t => Math.abs(t.x - v.x) < 1e-4) === i);

    let evalText = 'Tính giá trị hàm số tại các điểm ứng tuyển:\n';
    uniquePoints.forEach(p => {
      const yVal = evalY(p.x);
      if (!isNaN(yVal) && isFinite(yVal)) {
        candidates.push({ x: p.x, y: yVal, label: p.label });
        evalText += `* Tại ${p.label}: $f(${toExactLatex(p.x)}) = ${toExactLatex(yVal)}$\n`;
      }
    });

    // Infinity limits evaluation
    if (a === -Infinity) {
      const yInf = evalY(-1e5);
      evalText += `* Giới hạn $\\lim_{x \\to -\\infty} y = ${yInf > 1e3 ? '+\\infty' : (yInf < -1e3 ? '-\\infty' : toExactLatex(yInf))}$\n`;
      if (yInf > 1e3) maxExists = false;
      if (yInf < -1e3) minExists = false;
    }
    if (b === Infinity) {
      const yInf = evalY(1e5);
      evalText += `* Giới hạn $\\lim_{x \\to +\\infty} y = ${yInf > 1e3 ? '+\\infty' : (yInf < -1e3 ? '-\\infty' : toExactLatex(yInf))}$\n`;
      if (yInf > 1e3) maxExists = false;
      if (yInf < -1e3) minExists = false;
    }
    steps.push({
      title: 'Bước 4: So sánh giá trị',
      content: evalText.trim()
    });

    // 5. Determine Max/Min Values
    let maxVal: number | null = null;
    let maxAt: number[] | null = null;
    let minVal: number | null = null;
    let minAt: number[] | null = null;

    if (candidates.length > 0) {
      if (maxExists) {
        maxVal = Math.max(...candidates.map(c => c.y));
        maxAt = candidates.filter(c => Math.abs(c.y - maxVal!) < 1e-4).map(c => c.x);
      }
      if (minExists) {
        minVal = Math.min(...candidates.map(c => c.y));
        minAt = candidates.filter(c => Math.abs(c.y - minVal!) < 1e-4).map(c => c.x);
      }
    } else {
      maxExists = false;
      minExists = false;
    }

    // Step 5: Final Conclusion
    let conclusionText = 'So sánh tất cả các giá trị, ta kết luận:\n';
    if (maxExists && maxVal !== null && maxAt) {
      const atStr = maxAt.map(x => `x = ${toExactLatex(x)}`).join('; ');
      conclusionText += `* **Giá trị lớn nhất (GTLN)**: $\\max_{x \\in I} f(x) = ${toExactLatex(maxVal)}$ tại $${atStr}$.\n`;
    } else {
      conclusionText += `* **Không tồn tại giá trị lớn nhất (GTLN)** trên miền khảo sát.\n`;
    }

    if (minExists && minVal !== null && minAt) {
      const atStr = minAt.map(x => `x = ${toExactLatex(x)}`).join('; ');
      conclusionText += `* **Giá trị nhỏ nhất (GTNN)**: $\\min_{x \\in I} f(x) = ${toExactLatex(minVal)}$ tại $${atStr}$.\n`;
    } else {
      conclusionText += `* **Không tồn tại giá trị nhỏ nhất (GTNN)** trên miền khảo sát.\n`;
    }
    steps.push({
      title: 'Bước 5: Kết luận GTLN, GTNN',
      content: conclusionText.trim()
    });

    // Save result
    setResult({
      a,
      b,
      maxVal,
      maxAt,
      minVal,
      minAt,
      maxExists,
      minExists,
      candidates,
      steps
    });

    // Dispatch highlight range back to VisualBBT
    const renderA = a === -Infinity ? -1000 : a;
    const renderB = b === Infinity ? 1000 : b;
    
    const maxPts = (maxExists && maxVal !== null && maxAt) ? maxAt.map(x => ({ x, y: maxVal! })) : [];
    const minPts = (minExists && minVal !== null && minAt) ? minAt.map(x => ({ x, y: minVal! })) : [];
    
    onHighlightRange([renderA, renderB], maxPts, minPts);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col gap-4 p-5 no-print">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-lg">
          <Calculator className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-display font-bold text-slate-800 text-sm md:text-base">
            Tìm Cực Trị Tuyệt Đối (GTLN / GTNN)
          </h3>
          <p className="text-xs text-slate-400">
            Tìm giá trị lớn nhất, nhỏ nhất trên một khoảng khảo sát tùy chọn
          </p>
        </div>
      </div>

      {/* Input controls */}
      <div className="grid grid-cols-2 gap-3.5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-500 flex items-center gap-0.5 animate-fade-in">
            Cận dưới a
            <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" title="Để trống nếu khảo sát từ -vô cùng" />
          </label>
          <input
            type="text"
            value={lowerBound}
            onChange={(e) => setLowerBound(e.target.value)}
            placeholder="-∞"
            className="w-full h-10 px-3 border border-slate-250 hover:border-slate-350 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl outline-none font-mono text-xs transition-all shadow-sm bg-slate-50/20"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-500 flex items-center gap-0.5 animate-fade-in">
            Cận trên b
            <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" title="Để trống nếu khảo sát tới +vô cùng" />
          </label>
          <input
            type="text"
            value={upperBound}
            onChange={(e) => setUpperBound(e.target.value)}
            placeholder="+∞"
            className="w-full h-10 px-3 border border-slate-250 hover:border-slate-350 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl outline-none font-mono text-xs transition-all shadow-sm bg-slate-50/20"
          />
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Button Action */}
      <button
        onClick={handleCalculate}
        className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all"
      >
        <Sparkles className="w-4 h-4" />
        Tính toán GTLN & GTNN
      </button>

      {/* Results Display */}
      {result && (
        <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* GTLN */}
            <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-3.5 flex flex-col gap-1 shadow-sm animate-fade-in">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Giá trị lớn nhất (GTLN)</span>
              <div className="flex flex-wrap items-baseline gap-1 mt-0.5">
                {result.maxExists && result.maxVal !== null ? (
                  <>
                    <span className="text-xl font-bold text-emerald-950 font-mono">
                      <MathLaTeX math={toExactLatex(result.maxVal)} />
                    </span>
                    <span className="text-[9px] text-emerald-600 font-semibold">
                      tại <MathLaTeX math={`x = ${result.maxAt?.map(x => toExactLatex(x)).join(', ')}`} />
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-slate-500">Không tồn tại</span>
                )}
              </div>
            </div>

            {/* GTNN */}
            <div className="bg-rose-50/40 border border-rose-100 rounded-2xl p-3.5 flex flex-col gap-1 shadow-sm animate-fade-in">
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Giá trị nhỏ nhất (GTNN)</span>
              <div className="flex flex-wrap items-baseline gap-1 mt-0.5">
                {result.minExists && result.minVal !== null ? (
                  <>
                    <span className="text-xl font-bold text-rose-950 font-mono">
                      <MathLaTeX math={toExactLatex(result.minVal)} />
                    </span>
                    <span className="text-[9px] text-rose-600 font-semibold">
                      tại <MathLaTeX math={`x = ${result.minAt?.map(x => toExactLatex(x)).join(', ')}`} />
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-slate-500">Không tồn tại</span>
                )}
              </div>
            </div>
          </div>

          {/* Explanation Proof */}
          <div className="border border-slate-150 rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setShowExplanation(!showExplanation)}
              className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/70 border-b border-slate-150 text-left text-xs font-bold text-slate-700 flex items-center justify-between transition-all"
            >
              <span>Xem Lời giải chi tiết tìm cực trị</span>
              {showExplanation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            <AnimatePresence initial={false}>
              {showExplanation && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="overflow-hidden bg-white"
                >
                  <div className="p-4 flex flex-col gap-3">
                    {result.steps.map((step, idx) => (
                      <div key={`step-extrema-${idx}`} className="flex flex-col gap-1 text-xs">
                        <div className="font-bold text-indigo-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                          {step.title}
                        </div>
                        <div className="pl-5 text-slate-600 font-medium whitespace-pre-line leading-relaxed">
                          {renderRichText(step.content)}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
