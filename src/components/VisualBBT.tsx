/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useMemo } from 'react';
import * as math from 'mathjs';
import { XPoint, FunctionAnalysis, YPrimePointSymbol, YPrimeIntervalSymbol, YPointValue } from '../types';
import { MathLaTeX } from './MathLaTeX';
import { toExactLatex } from '../lib/cas';
import { Eye, EyeOff, Check, X, ZoomIn, ZoomOut, RotateCcw, Scale, Maximize2, Minimize2, SlidersHorizontal, ChevronRight, ChevronLeft } from 'lucide-react';

interface VisualBBTProps {
  analysis: FunctionAnalysis;
  isTeacherMode?: boolean;
  isStudentMode?: boolean;
  maskedCellIds?: Set<string>;
  userAnswers?: Record<string, string>;
  showResults?: boolean;
  onToggleMask?: (cellId: string, originalValue: string, type: 'x' | 'y_prime_point' | 'y_prime_interval' | 'y_value', index: number, subIndex?: 'left' | 'right' | 'single') => void;
  onAnswerChange?: (cellId: string, value: string) => void;
  showGraph?: boolean;
  highlightRange?: [number, number] | null;
  highlightMaxPts?: { x: number; y: number }[];
  highlightMinPts?: { x: number; y: number }[];
}

export function VisualBBT({
  analysis,
  isTeacherMode = false,
  isStudentMode = false,
  maskedCellIds = new Set(),
  userAnswers = {},
  showResults = false,
  onToggleMask,
  onAnswerChange,
  showGraph = true,
  highlightRange = null,
  highlightMaxPts = [],
  highlightMinPts = [],
}: VisualBBTProps) {
  const { x_points, y_prime, y_row } = analysis;
  const N = x_points.length;

  const formatMathValue = (val: number): string => {
    return parseFloat(val.toFixed(4)).toString();
  };

  const [displayFormat, setDisplayFormat] = useState<'fraction' | 'decimal'>('fraction');
  const [decimalPlaces, setDecimalPlaces] = useState<number>(2);

  const formatValue = (val: number): string => {
    if (isNaN(val) || !isFinite(val)) return '';
    if (displayFormat === 'fraction') {
      const latex = toExactLatex(val);
      if (!latex.includes('\\frac') && !latex.includes('\\sqrt') && latex.includes('.')) {
        return parseFloat(val.toFixed(decimalPlaces)).toString();
      }
      return latex;
    }
    return parseFloat(val.toFixed(decimalPlaces)).toString();
  };

  // --- GRAPH PLOTTING STATE & CALCULATIONS ---
  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [colCenters, setColCenters] = useState<number[]>([]);
  const [intervalBounds, setIntervalBounds] = useState<{ left: number; width: number }[]>([]);
  const [svgLeft, setSvgLeft] = useState<number>(0);
  
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverXVal, setHoverXVal] = useState<number | null>(null);
  const [hoverYVal, setHoverYVal] = useState<number | null>(null);

  // Graph scale mode and zoom factor states
  const [scaleMode, setScaleMode] = useState<'bbt' | 'linear'>('linear');
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [autoFitY, setAutoFitY] = useState<boolean>(true);
  const [containerWidth, setContainerWidth] = useState<number>(800);

  const activeIntervalIdx = useMemo(() => {
    if (hoverX === null || intervalBounds.length === 0) return -1;
    for (let k = 0; k < intervalBounds.length; k++) {
      const b = intervalBounds[k];
      if (hoverX >= b.left && hoverX <= b.left + b.width) {
        return k;
      }
    }
    return -1;
  }, [hoverX, intervalBounds]);

  // Measure milestone cell centers & SVG container offset
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateCenters = () => {
      const parentRect = container.getBoundingClientRect();
      setContainerWidth(parentRect.width);
      
      // Measure centers of the milestone cells
      const centers: number[] = [];
      for (let i = 0; i < N; i++) {
        const el = container.querySelector(`[data-bbt-col="${i}"]`);
        if (el) {
          const elRect = el.getBoundingClientRect();
          const cx = elRect.left - parentRect.left + elRect.width / 2;
          centers.push(cx);
        } else {
          centers.push(0);
        }
      }
      setColCenters(centers);

      // Measure interval boundaries
      const bounds: { left: number; width: number }[] = [];
      for (let i = 0; i < N - 1; i++) {
        const el = container.querySelector(`[data-bbt-interval="${i}"]`);
        if (el) {
          const elRect = el.getBoundingClientRect();
          bounds.push({
            left: elRect.left - parentRect.left,
            width: elRect.width
          });
        } else {
          bounds.push({ left: 0, width: 0 });
        }
      }
      setIntervalBounds(bounds);

      // Measure the offset of the SVG container
      const svgContainer = svgContainerRef.current;
      if (svgContainer) {
        setSvgLeft(svgContainer.offsetLeft);
      }
    };

    // Run once and queue after a short delay for LaTeX load
    updateCenters();
    const timer = setTimeout(updateCenters, 200);

    const observer = new ResizeObserver(() => {
      updateCenters();
    });
    observer.observe(container);

    window.addEventListener('resize', updateCenters);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', updateCenters);
    };
  }, [analysis, N, isFullscreen, scaleMode]);

  // Clean mathjs compiled function
  const compiledFn = useMemo(() => {
    try {
      // Basic preprocessor to insert missing '*' signs for simple implicit multiplication like 2x, 3x
      let formula = analysis.functionStr;
      formula = formula.replace(/(\d+)([a-zA-Z\(])/g, '$1*$2');
      formula = formula.replace(/(\))(\d+)/g, '$1*$2');
      formula = formula.replace(/(\))([a-zA-Z])/g, '$1*$2');
      formula = formula.replace(/([xX])(\()/g, '$1*$2');
      
      return math.compile(formula);
    } catch (e) {
      console.error("Error compiling function in frontend:", e);
      return null;
    }
  }, [analysis.functionStr]);

  const evaluateY = (x: number): number => {
    if (!compiledFn) return NaN;
    try {
      const val = compiledFn.evaluate({ x });
      if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
        return val;
      }
    } catch (e) {
      // Silent error for pole evaluations
    }
    return NaN;
  };

  // Determine the graphing range based on milestones
  const domainBounds = useMemo(() => {
    // Find milestones (finite x values with index in x_points)
    const milestones = x_points
      .map((p, idx) => ({ p, idx, value: p.value }))
      .filter(m => m.p.type !== 'infinity' && m.value !== undefined && isFinite(m.value)) as { p: XPoint, idx: number, value: number }[];

    if (milestones.length === 0) {
      return { xStart: -12, xEnd: 12 };
    } else if (milestones.length === 1) {
      const v = milestones[0].value;
      return { xStart: v - 12, xEnd: v + 12 };
    } else {
      const first = milestones[0];
      const last = milestones[milestones.length - 1];
      const idx_first = first.idx;
      const idx_last = last.idx;
      const v_first = first.value;
      const v_last = last.value;

      const indexDiff = idx_last - idx_first;
      const valDiff = v_last - v_first;

      if (indexDiff > 0 && valDiff > 0) {
        const step = valDiff / indexDiff;
        const xStart = Math.min(v_first - 12, v_first - idx_first * step);
        const xEnd = Math.max(v_last + 12, v_last + (N - 1 - idx_last) * step);
        return { xStart, xEnd };
      } else {
        const minV = Math.min(...milestones.map(m => m.value));
        const maxV = Math.max(...milestones.map(m => m.value));
        const spacing = maxV - minV || 2;
        const margin = Math.max(12, spacing * 1.5);
        return { xStart: minV - margin, xEnd: maxV + margin };
      }
    }
  }, [x_points, N]);

  const { xStart, xEnd } = domainBounds;

  // Map pixel to mathematical X
  const pixelToX = (px: number): number => {
    if (colCenters.length < 2) return 0;
    
    if (scaleMode === 'bbt') {
      // Find interval index
      let i = 0;
      for (let k = 0; k < colCenters.length - 1; k++) {
        if (px >= colCenters[k] && px <= colCenters[k+1]) {
          i = k;
          break;
        }
        if (k === colCenters.length - 2) {
          i = k;
        }
      }

      const pLeft = x_points[i];
      const pRight = x_points[i+1];
      const cLeft = colCenters[i];
      const cRight = colCenters[i+1];

      const t = (px - cLeft) / (cRight - cLeft || 1);

      if (pLeft.type === 'infinity' && pRight.type === 'infinity') {
        return xStart + t * (xEnd - xStart);
      } else if (pLeft.type === 'infinity') {
        const rightVal = pRight.value!;
        return xStart + t * (rightVal - xStart);
      } else if (pRight.type === 'infinity') {
        const leftVal = pLeft.value!;
        return leftVal + t * (xEnd - leftVal);
      } else {
        const leftVal = pLeft.value!;
        const rightVal = pRight.value!;
        return leftVal + t * (rightVal - leftVal);
      }
    } else {
      // Linear 1:1 mode
      const t = (px - colCenters[0]) / (colCenters[colCenters.length - 1] - colCenters[0] || 1);
      return xStart + t * (xEnd - xStart);
    }
  };

  // Map mathematical X to pixel
  const xToPixel = (x: number): number => {
    if (colCenters.length < 2) return 0;
    
    if (scaleMode === 'bbt') {
      if (x <= xStart) return colCenters[0];
      if (x >= xEnd) return colCenters[colCenters.length - 1];

      let i = 0;
      for (let k = 0; k < x_points.length - 1; k++) {
        const pLeft = x_points[k];
        const pRight = x_points[k+1];
        const leftVal = pLeft.type === 'infinity' ? xStart : pLeft.value!;
        const rightVal = pRight.type === 'infinity' ? xEnd : pRight.value!;
        if (x >= leftVal && x <= rightVal) {
          i = k;
          break;
        }
      }

      const pLeft = x_points[i];
      const pRight = x_points[i+1];
      const cLeft = colCenters[i];
      const cRight = colCenters[i+1];
      const leftVal = pLeft.type === 'infinity' ? xStart : pLeft.value!;
      const rightVal = pRight.type === 'infinity' ? xEnd : pRight.value!;

      const t = (x - leftVal) / (rightVal - leftVal || 1);
      return cLeft + t * (cRight - cLeft);
    } else {
      // Linear 1:1 mode
      const t = (x - xStart) / (xEnd - xStart || 1);
      return colCenters[0] + t * (colCenters[colCenters.length - 1] - colCenters[0]);
    }
  };

  // Gather y-values sample to scale graph viewport nicely
  const yRange = useMemo(() => {
    if (colCenters.length < 2) return { yMin: -5, yMax: 5 };

    const sampleYVals: number[] = [];
    const stepSize = (colCenters[colCenters.length - 1] - colCenters[0]) / 50;
    
    for (let px = colCenters[0]; px <= colCenters[colCenters.length - 1]; px += stepSize) {
      const x = pixelToX(px);
      const isNearPole = x_points.some(p => p.type === 'discontinuity' && Math.abs(x - p.value!) < 0.2);
      if (!isNearPole) {
        const yVal = evaluateY(x);
        if (!isNaN(yVal) && isFinite(yVal)) {
          sampleYVals.push(yVal);
        }
      }
    }

    // Include critical values
    x_points.forEach((p) => {
      if (p.type === 'critical' && p.value !== undefined && isFinite(p.value)) {
        const yVal = evaluateY(p.value);
        if (!isNaN(yVal)) {
          sampleYVals.push(yVal);
        }
      }
    });

    let yMin = -5;
    let yMax = 5;
    if (sampleYVals.length > 0) {
      const sorted = [...sampleYVals].sort((a, b) => a - b);
      const q5 = sorted[Math.floor(sorted.length * 0.05)] ?? sorted[0];
      const q95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? sorted[sorted.length - 1];
      
      yMin = q5;
      yMax = q95;
      
      // Expand yMin and yMax to ensure all critical values are visible
      x_points.forEach((p) => {
        if (p.type === 'critical' && p.value !== undefined && isFinite(p.value)) {
          const yVal = evaluateY(p.value);
          if (!isNaN(yVal)) {
            yMin = Math.min(yMin, yVal);
            yMax = Math.max(yMax, yVal);
          }
        }
      });
      
      const yDiff = yMax - yMin;
      if (yDiff < 0.1) {
        yMin -= 2;
        yMax += 2;
      } else {
        yMin -= yDiff * 0.15;
        yMax += yDiff * 0.15;
      }
    }
    return { yMin, yMax };
  }, [colCenters, compiledFn, x_points, scaleMode]);

  const { yMin, yMax } = yRange;
  const svgHeight = 350; // Taller for high mathematical accuracy!

  const mapYToPixel = (y: number): number => {
    if (isNaN(y) || !isFinite(y)) return NaN;
    if (scaleMode === 'bbt') {
      const pad = 24;
      const scale = (svgHeight - 2 * pad) / (yMax - yMin || 1);
      const py = svgHeight - pad - (y - yMin) * scale;
      return Math.max(-100, Math.min(svgHeight + 100, py));
    } else {
      if (autoFitY) {
        const pad = 24;
        const scale = (svgHeight - 2 * pad) / (yMax - yMin || 1) * zoomFactor;
        const yMid = (yMin + yMax) / 2;
        const py = svgHeight / 2 - (y - yMid) * scale;
        return Math.max(-200, Math.min(svgHeight + 200, py));
      } else {
        // Linear 1:1 mode
        const xScale = (colCenters[colCenters.length - 1] - colCenters[0]) / (xEnd - xStart || 1);
        const yScale = xScale * zoomFactor;
        const yMid = (yMin + yMax) / 2;
        const py = svgHeight / 2 - (y - yMid) * yScale;
        return Math.max(-200, Math.min(svgHeight + 200, py));
      }
    }
  };

  const xTicks = useMemo(() => {
    if (scaleMode !== 'linear') return [];
    const span = xEnd - xStart;
    let step = 1;
    if (span > 100) step = 10;
    else if (span > 40) step = 5;
    else if (span > 20) step = 2;
    else if (span < 5) step = 0.5;
    
    const ticks: number[] = [];
    const startTick = Math.ceil(xStart / step) * step;
    for (let val = startTick; val <= xEnd; val += step) {
      if (Math.abs(val) > 1e-5) {
        ticks.push(val);
      }
    }
    return ticks;
  }, [xStart, xEnd, scaleMode]);

  const yTicks = useMemo(() => {
    const span = yMax - yMin;
    let step = 1;
    if (span > 1000) step = 100;
    else if (span > 400) step = 50;
    else if (span > 200) step = 20;
    else if (span > 100) step = 10;
    else if (span > 40) step = 5;
    else if (span > 20) step = 2;
    else if (span < 5) step = 0.5;
    
    const ticks: number[] = [];
    const startTick = Math.ceil(yMin / step) * step;
    for (let val = startTick; val <= yMax; val += step) {
      if (Math.abs(val) > 1e-5) {
        ticks.push(val);
      }
    }
    return ticks;
  }, [yMin, yMax]);

  // Helper to check if a pole is between x1 and x2
  const hasPoleBetween = (x1: number, x2: number): boolean => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    return x_points.some(p => p.type === 'discontinuity' && p.value !== undefined && p.value >= minX && p.value <= maxX);
  };

  // Compile graph paths
  const graphPaths = useMemo(() => {
    if (colCenters.length < 2) return [];

    const startPx = colCenters[0];
    const endPx = colCenters[colCenters.length - 1];
    
    const paths: string[] = [];
    let currentD = '';
    let prevX: number | null = null;

    const step = 2; // pixel step
    for (let px = startPx; px <= endPx; px += step) {
      const x = pixelToX(px);
      
      // Check if we crossed a pole
      if (prevX !== null && hasPoleBetween(prevX, x)) {
        if (currentD) {
          paths.push(currentD);
          currentD = '';
        }
        prevX = null;
      }

      const y = evaluateY(x);
      const py = mapYToPixel(y);

      if (isNaN(py) || Math.abs(py) > svgHeight + 150) {
        if (currentD) {
          paths.push(currentD);
          currentD = '';
        }
        prevX = x;
      } else {
        if (!currentD) {
          currentD = `M ${px} ${py}`;
        } else {
          currentD += ` L ${px} ${py}`;
        }
        prevX = x;
      }
    }

    if (currentD) {
      paths.push(currentD);
    }

    return paths;
  }, [colCenters, scaleMode, zoomFactor, yRange, compiledFn, N]);

  // Coordinates axes calculations
  const yZeroPx = mapYToPixel(0);
  const xZeroPx = xToPixel(0);

  // Horizontal asymptotes limits
  const asymptotesH = useMemo(() => {
    const list: number[] = [];
    const pStart = y_row.points[0];
    if (pStart && pStart.type === 'single' && !pStart.latex.includes('inf') && !pStart.latex.includes('vôcực') && !pStart.latex.includes('oo')) {
      const val = parseFloat(pStart.latex);
      if (!isNaN(val)) list.push(val);
    }
    const pEnd = y_row.points[N-1];
    if (pEnd && pEnd.type === 'single' && !pEnd.latex.includes('inf') && !pEnd.latex.includes('vôcực') && !pEnd.latex.includes('oo')) {
      const val = parseFloat(pEnd.latex);
      if (!isNaN(val) && !list.includes(val)) list.push(val);
    }
    return list;
  }, [y_row.points, N]);

  // Mouse interactivity triggers
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || colCenters.length < 2) return;
    const rect = container.getBoundingClientRect();
    const px = e.clientX - rect.left;

    if (px >= colCenters[0] && px <= colCenters[colCenters.length - 1]) {
      // Snapping check: if we are within 14px of any milestone, snap exactly to it
      let targetPx = px;
      let targetXVal: number | null = null;
      
      for (let k = 0; k < colCenters.length; k++) {
        const p = x_points[k];
        if (p.type !== 'infinity' && p.value !== undefined) {
          const milestonePx = scaleMode === 'linear' ? xToPixel(p.value) : colCenters[k];
          if (Math.abs(px - milestonePx) < 14) {
            targetPx = milestonePx;
            targetXVal = p.value;
            break;
          }
        }
      }

      const xVal = targetXVal !== null ? targetXVal : pixelToX(targetPx);
      const yVal = evaluateY(xVal);
      setHoverX(targetPx);
      setHoverXVal(xVal);
      setHoverYVal(yVal);
    } else {
      setHoverX(null);
      setHoverXVal(null);
      setHoverYVal(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverX(null);
    setHoverXVal(null);
    setHoverYVal(null);
  };

  const isReady = colCenters.length === N && colCenters.every(c => c > 0);

  // Helper to map positions ('top', 'middle', 'bottom') to SVG Y coordinates (out of 220px height)
  const getPositionY = (pos: 'top' | 'middle' | 'bottom') => {
    switch (pos) {
      case 'top': return 24;
      case 'middle': return 110;
      case 'bottom': return 196;
      default: return 110;
    }
  };

  // Helper to normalize strings for grading (removes spaces, lowercases, standardizes infinity)
  const isAnswerCorrect = (userAns: string, correctAns: string) => {
    if (!userAns) return false;
    const cleanUser = userAns.trim().toLowerCase().replace(/\s+/g, '');
    const cleanCorrect = correctAns.trim().toLowerCase().replace(/\s+/g, '');

    if (cleanUser === cleanCorrect) return true;

    // Smart checks for infinity representations
    const infRepresentations = ['-\\infty', '-inf', '-vôcực', '-vocuc', '-oo'];
    if (cleanCorrect === '-\\infty' && infRepresentations.includes(cleanUser)) return true;
    
    const posInfRepresentations = ['+\\infty', '\\infty', '+inf', 'inf', '+vôcực', 'vôcực', '+vocuc', 'vocuc', 'oo', '+oo'];
    if (cleanCorrect === '+\\infty' && posInfRepresentations.includes(cleanUser)) return true;

    // Smart checks for square roots, e.g. \sqrt{2} vs sqrt(2) or căn 2
    if (cleanCorrect.includes('\\sqrt') && (cleanUser.includes('sqrt') || cleanUser.includes('can') || cleanUser.includes('căn'))) {
      const num = cleanCorrect.match(/\d+/)?.[0];
      if (num && (cleanUser.includes(`sqrt(${num})`) || cleanUser.includes(`can${num}`) || cleanUser.includes(`căn${num}`) || cleanUser.includes(`sqrt${num}`))) {
        return true;
      }
    }

    // Smart check for fractions, e.g. \frac{1}{2} vs 1/2
    if (cleanCorrect.includes('\\frac')) {
      const matches = cleanCorrect.match(/\\frac\{(\d+)\}\{(\d+)\}/);
      if (matches && matches[1] && matches[2]) {
        const fracStr = `${matches[1]}/${matches[2]}`;
        if (cleanUser === fracStr) return true;
      }
    }

    return false;
  };

  // Cell rendering engine
  const renderCellContent = (
    cellId: string,
    originalValue: string,
    cellType: 'x' | 'y_prime_point' | 'y_prime_interval' | 'y_value',
    index: number,
    subIndex: 'left' | 'right' | 'single' = 'single'
  ) => {
    const isMasked = maskedCellIds.has(cellId);

    // --- 1. TEACHER CONFIGURATION MODE ---
    if (isTeacherMode) {
      const isDoubleLine = cellType === 'y_prime_point' && originalValue === 'd';
      return (
        <div
          onClick={() => onToggleMask?.(cellId, originalValue, cellType, index, subIndex)}
          className={`group/cell relative flex items-center justify-center p-2 rounded cursor-pointer transition-all min-h-[40px] w-full border ${
            isMasked
              ? 'bg-amber-50/80 border-dashed border-amber-300 hover:bg-amber-100/90 text-amber-800'
              : 'border-transparent hover:border-indigo-300 hover:bg-indigo-50/30'
          }`}
          title={isMasked ? "Bấm để bỏ giấu ô này" : "Bấm để giấu ô này đối với học sinh"}
        >
          <div className={`${isMasked ? 'opacity-40 line-through' : ''} ${isDoubleLine ? 'h-8 w-6' : ''}`}>
            {isDoubleLine ? (
              <div className="flex justify-center items-stretch h-full gap-[3px] select-none px-1">
                <div className="w-[1.2px] h-full bg-slate-300 dark:bg-slate-600"></div>
                <div className="w-[1.2px] h-full bg-slate-300 dark:bg-slate-600"></div>
              </div>
            ) : (
              <MathLaTeX math={originalValue || '\\varnothing'} />
            )}
          </div>
          
          {/* Action indicator badge on hover */}
          <div className="absolute right-0.5 top-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity bg-white border border-slate-200 rounded-full p-0.5 shadow-sm z-10">
            {isMasked ? (
              <EyeOff className="w-3.5 h-3.5 text-amber-600" />
            ) : (
              <Eye className="w-3.5 h-3.5 text-indigo-500" />
            )}
          </div>
        </div>
      );
    }

    // --- 2. STUDENT WORKBOOK QUIZ MODE ---
    if (isStudentMode && isMasked) {
      const userValue = userAnswers[cellId] || '';
      const isCorrect = isAnswerCorrect(userValue, originalValue);
      
      // Select box for quick toggling symbols on y' row
      if (cellType === 'y_prime_point' || cellType === 'y_prime_interval') {
        const options = cellType === 'y_prime_point' 
          ? [
              { value: '', label: '?' },
              { value: '0', label: '0' },
              { value: 'd', label: '||' },
              { value: 'empty', label: '(trống)' }
            ]
          : [
              { value: '', label: '?' },
              { value: '+', label: '+' },
              { value: '-', label: '-' },
              { value: 'h', label: '///' }
            ];

        // Format user selections back to standard values
        const currentSelectVal = userValue === '' ? '' : userValue === 'empty' ? 'empty' : userValue;

        return (
          <div className="flex flex-col items-center justify-center w-full px-1 py-1">
            <select
              value={currentSelectVal}
              disabled={showResults}
              onChange={(e) => onAnswerChange?.(cellId, e.target.value === 'empty' ? '' : e.target.value)}
              className={`text-center font-bold text-sm rounded border bg-white focus:ring-2 outline-none h-8 w-14 transition-all ${
                showResults
                  ? isCorrect
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 focus:ring-emerald-200'
                    : 'border-rose-400 bg-rose-50 text-rose-800 focus:ring-rose-200'
                  : 'border-slate-300 text-slate-700 hover:border-slate-400 focus:ring-indigo-200 focus:border-indigo-400'
              }`}
            >
              {options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {showResults && (
              <div className="mt-1 flex items-center justify-center text-xs">
                {isCorrect ? (
                  <span className="text-emerald-600 font-medium flex items-center gap-0.5"><Check className="w-3 h-3" /> Đúng</span>
                ) : (
                  <span className="text-rose-600 font-medium flex flex-col items-center">
                    <span className="flex items-center gap-0.5"><X className="w-3 h-3" /> Sai</span>
                    <span className="text-[10px] bg-slate-100 px-1 py-0.5 rounded text-slate-600 font-mono mt-0.5">
                      Đáp án: {originalValue || '(trống)'}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        );
      }

      // Text input box for general fields (x points, y values)
      return (
        <div className="flex flex-col items-center justify-center w-full px-1">
          <input
            type="text"
            disabled={showResults}
            value={userValue}
            onChange={(e) => onAnswerChange?.(cellId, e.target.value)}
            placeholder="?"
            className={`w-full max-w-[76px] h-8 text-center text-sm font-semibold rounded border bg-white transition-all focus:ring-2 outline-none ${
              showResults
                ? isCorrect
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 focus:ring-emerald-200'
                  : 'border-rose-400 bg-rose-50 text-rose-800 focus:ring-rose-200'
                : 'border-slate-300 text-slate-700 hover:border-slate-400 focus:ring-indigo-200 focus:border-indigo-400'
            }`}
          />
          {showResults && (
            <div className="mt-1 flex items-center justify-center text-xs">
              {isCorrect ? (
                <span className="text-emerald-600 font-medium flex items-center gap-0.5"><Check className="w-3 h-3" /> Đúng</span>
              ) : (
                <span className="text-rose-600 font-medium flex flex-col items-center text-center">
                  <span className="flex items-center gap-0.5"><X className="w-3 h-3" /> Sai</span>
                  <span className="text-[10px] bg-slate-100 px-1 py-0.5 rounded text-slate-600 font-mono mt-0.5 truncate max-w-[80px]">
                    {originalValue}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      );
    }

    // --- 3. STANDARD DISPLAY MODE ---
    if (cellType === 'y_prime_point' && originalValue === 'd') {
      return (
        <div className="flex justify-center items-stretch h-full gap-[3px] select-none px-1">
          <div className="w-[1.2px] h-full bg-slate-300 dark:bg-slate-600"></div>
          <div className="w-[1.2px] h-full bg-slate-300 dark:bg-slate-600"></div>
        </div>
      );
    }

    if (cellType === 'y_prime_interval' && originalValue === 'h') {
      return (
        <div className="relative flex items-center justify-center w-full h-full min-h-[36px] bg-slate-100/40 select-none overflow-hidden">
          {/* Hatched lines pattern */}
          <div className="absolute inset-0 opacity-15 bg-[repeating-linear-gradient(45deg,#000,#000_4px,transparent_4px,transparent_8px)]"></div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-[36px] text-slate-800 select-all font-medium">
        <MathLaTeX math={originalValue} />
      </div>
    );
  };

  const gridStyle = useMemo(() => {
    const W_header = 72;
    const W_m = 64;
    const W_content = Math.max(500, containerWidth - W_header);

    if (scaleMode === 'linear') {
      const cols: string[] = [];
      for (let i = 0; i < N; i++) {
        cols.push(`${W_m}px`);
        if (i < N - 1) {
          const pLeft = x_points[i];
          const pRight = x_points[i + 1];
          const leftVal = pLeft.type === 'infinity' ? xStart : pLeft.value!;
          const rightVal = pRight.type === 'infinity' ? xEnd : pRight.value!;
          const tLeft = (leftVal - xStart) / (xEnd - xStart || 1);
          const tRight = (rightVal - xStart) / (xEnd - xStart || 1);
          const targetDist = (tRight - tLeft) * W_content;
          const w_int = Math.max(12, targetDist - W_m);
          cols.push(`${w_int.toFixed(1)}px`);
        }
      }
      return {
        display: 'grid',
        gridTemplateColumns: `${W_header}px ${cols.join(' ')}`,
      };
    } else {
      // Uniform 1fr intervals
      return {
        display: 'grid',
        gridTemplateColumns: `minmax(64px, 80px) ${Array.from({ length: N }).map((_, i) => `minmax(56px, max-content) ${i < N - 1 ? '1fr' : ''}`).join(' ').trim()}`,
      };
    }
  }, [scaleMode, N, x_points, xStart, xEnd, containerWidth]);

  const mainContent = (
    <div 
      ref={containerRef}
      style={gridStyle} 
      className="min-w-[650px] font-sans text-sm select-none relative"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
        
        {/* ROW 0: GRAPH PLOT OVERVIEW */}
        {showGraph && (
          <>
            <div className="flex flex-col items-center justify-center bg-slate-100/70 border-r border-b border-slate-200 font-bold text-slate-700 py-3 min-h-[350px]">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Đồ thị</div>
              <div className="text-sm text-indigo-600 bg-indigo-50 px-2 py-1 rounded font-mono font-medium max-w-[70px] truncate">
                y = f(x)
              </div>
            </div>
            <div 
              ref={svgContainerRef}
              style={{ gridColumn: '2 / -1' }} 
              className="relative h-[350px] border-b border-slate-200 bg-slate-50/20 overflow-hidden"
            >
              {isReady ? (
                <>
                  <svg className="w-full h-full select-none" style={{ display: 'block' }}>
                    {/* 0. Cartesian grid lines */}
                    {scaleMode === 'linear' && (
                      <g className="grid-lines select-none opacity-40">
                        {xTicks.map(val => {
                          const px = xToPixel(val) - svgLeft;
                          const startPx = colCenters[0] - svgLeft;
                          const endPx = colCenters[colCenters.length - 1] - svgLeft;
                          if (px < startPx || px > endPx) return null;
                          return (
                            <g key={`grid-x-${val}`}>
                              <line x1={px} y1={0} x2={px} y2={svgHeight} stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="2 2" />
                              <text x={px} y={svgHeight - 6} fill="#94a3b8" fontSize="8" textAnchor="middle" className="font-semibold">{val}</text>
                            </g>
                          );
                        })}
                        {yTicks.map(val => {
                          const py = mapYToPixel(val);
                          if (py < 10 || py > svgHeight - 10) return null;
                          const startPx = colCenters[0] - svgLeft;
                          const endPx = colCenters[colCenters.length - 1] - svgLeft;
                          return (
                            <g key={`grid-y-${val}`}>
                              <line x1={startPx} y1={py} x2={endPx} y2={py} stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="2 2" />
                              <text x={startPx + 6} y={py + 3} fill="#94a3b8" fontSize="8" className="font-semibold">{val}</text>
                            </g>
                          );
                        })}
                      </g>
                    )}

                    {/* 0.5. Highlighted interval range */}
                    {highlightRange && (
                      <g>
                        {(() => {
                          const pxA = xToPixel(highlightRange[0]) - svgLeft;
                          const pxB = xToPixel(highlightRange[1]) - svgLeft;
                          const startPx = colCenters[0] - svgLeft;
                          const endPx = colCenters[colCenters.length - 1] - svgLeft;
                          
                          const constrainedA = Math.max(startPx, Math.min(endPx, pxA));
                          const constrainedB = Math.max(startPx, Math.min(endPx, pxB));
                          
                          const x = Math.min(constrainedA, constrainedB);
                          const width = Math.max(1, Math.abs(constrainedB - constrainedA));
                          
                          return (
                            <rect 
                              x={x} 
                              y={0} 
                              width={width} 
                              height={svgHeight} 
                              fill="#6366f1" 
                              fillOpacity="0.06" 
                              stroke="#6366f1" 
                              strokeWidth="1.2" 
                              strokeDasharray="3 3" 
                            />
                          );
                        })()}
                      </g>
                    )}

                    {/* 1. Horizontal axis (y=0) */}
                    {!isNaN(yZeroPx) && yZeroPx >= 0 && yZeroPx <= svgHeight && (
                      <g>
                        <line 
                          x1={colCenters[0] - svgLeft} 
                          y1={yZeroPx} 
                          x2={colCenters[N-1] - svgLeft} 
                          y2={yZeroPx} 
                          stroke="#cbd5e1" 
                          strokeWidth="1.5" 
                        />
                        <text 
                          x={colCenters[N-1] - svgLeft - 15} 
                          y={yZeroPx - 6} 
                          fill="#94a3b8" 
                          fontSize="10" 
                          fontFamily="monospace" 
                          className="font-bold select-none"
                        >
                          x
                        </text>
                      </g>
                    )}

                    {/* 2. Vertical axis (x=0) */}
                    {!isNaN(xZeroPx) && xZeroPx >= colCenters[0] && xZeroPx <= colCenters[N-1] && (
                      <g>
                        <line 
                          x1={xZeroPx - svgLeft} 
                          y1={0} 
                          x2={xZeroPx - svgLeft} 
                          y2={svgHeight} 
                          stroke="#cbd5e1" 
                          strokeWidth="1.5" 
                        />
                        <text 
                          x={xZeroPx - svgLeft + 6} 
                          y={15} 
                          fill="#94a3b8" 
                          fontSize="10" 
                          fontFamily="monospace" 
                          className="font-bold select-none"
                        >
                          y
                        </text>
                      </g>
                    )}

                    {/* 3. Horizontal asymptotes */}
                    {asymptotesH.map((val, idx) => {
                      const py = mapYToPixel(val);
                      if (!isNaN(py) && py >= 0 && py <= svgHeight) {
                        return (
                          <g key={`asymptote-h-${idx}`}>
                            <line 
                              x1={colCenters[0] - svgLeft} 
                              y1={py} 
                              x2={colCenters[N-1] - svgLeft} 
                              y2={py} 
                              stroke="#f43f5e" 
                              strokeWidth="1.2" 
                              strokeDasharray="4 3" 
                            />
                            <text 
                              x={colCenters[0] - svgLeft + 10} 
                              y={py - 4} 
                              fill="#e11d48" 
                              fontSize="9" 
                              fontFamily="monospace"
                              className="select-none"
                            >
                              y = {val}
                            </text>
                          </g>
                        );
                      }
                      return null;
                    })}

                    {/* 4. Vertical asymptotes */}
                    {x_points.map((p, idx) => {
                      if (p.type === 'discontinuity') {
                        const px = scaleMode === 'linear' ? xToPixel(p.value!) : colCenters[idx];
                        if (px > 0) {
                          return (
                            <g key={`asymptote-v-${idx}`}>
                              <line 
                                x1={px - svgLeft} 
                                y1={0} 
                                x2={px - svgLeft} 
                                y2={svgHeight} 
                                stroke="#f43f5e" 
                                strokeWidth="1.2" 
                                strokeDasharray="4 3" 
                              />
                              <text 
                                x={px - svgLeft + 6} 
                                y={25} 
                                fill="#e11d48" 
                                fontSize="9" 
                                fontFamily="monospace"
                                className="select-none font-semibold"
                              >
                                x = {p.value}
                              </text>
                            </g>
                          );
                        }
                      }
                      return null;
                    })}

                    {/* 5. Function Curves (Paths) */}
                    {graphPaths.map((d, idx) => {
                      if (!d) return null;
                      // Offset horizontal path coordinates by svgLeft
                      const offsetPath = d.replace(/(M|L)\s+([\d\.]+)\s+([\d\.-]+)/g, (match, cmd, xStr, yStr) => {
                        const xOffset = parseFloat(xStr) - svgLeft;
                        return `${cmd} ${xOffset.toFixed(1)} ${yStr}`;
                      });

                      return (
                        <path 
                          key={`curve-${idx}`} 
                          d={offsetPath} 
                          stroke="#4f46e5" 
                          strokeWidth="2.5" 
                          fill="none" 
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      );
                    })}

                    {/* 6. Extrema Critical dots */}
                    {x_points.map((p, idx) => {
                      if (p.type === 'critical' && p.value !== undefined) {
                        const px = scaleMode === 'linear' ? xToPixel(p.value) : colCenters[idx];
                        const yv = y_row.points[idx];
                        if (px > 0 && yv && yv.type === 'single') {
                          const yVal = evaluateY(p.value);
                          if (!isNaN(yVal)) {
                            const py = mapYToPixel(yVal);
                            if (!isNaN(py) && py >= 0 && py <= svgHeight) {
                              return (
                                <g key={`critical-dot-${idx}`}>
                                  <circle 
                                    cx={px - svgLeft} 
                                    cy={py} 
                                    r="5" 
                                    fill="#f43f5e" 
                                    stroke="#ffffff" 
                                    strokeWidth="1.5" 
                                  />
                                  <foreignObject
                                    x={px - svgLeft - 80}
                                    y={py > svgHeight / 2 ? py - 26 : py + 8}
                                    width={160}
                                    height={20}
                                    className="overflow-visible select-none pointer-events-none"
                                  >
                                    <div className="flex justify-center items-center h-full text-[9px] font-bold text-rose-700 bg-white/85 border border-rose-100 rounded px-1.5 shadow-sm">
                                      (<MathLaTeX math={`${formatValue(p.value!)}; ${formatValue(yVal)}`} />)
                                    </div>
                                  </foreignObject>
                                </g>
                              );
                            }
                          }
                        }
                      }
                      return null;
                    })}

                    {/* 6.5. GTLN / GTNN highlight dots */}
                    {(highlightMaxPts || []).map((pt, idx) => {
                      const px = xToPixel(pt.x) - svgLeft;
                      const py = mapYToPixel(pt.y);
                      const startPx = colCenters[0] - svgLeft;
                      const endPx = colCenters[colCenters.length - 1] - svgLeft;
                      if (px >= startPx && px <= endPx && py >= 0 && py <= svgHeight) {
                        return (
                          <g key={`max-highlight-${idx}`}>
                            <circle cx={px} cy={py} r="5.5" fill="#10b981" fillOpacity="0.4">
                              <animate attributeName="r" values="5.5;14;5.5" dur="2s" repeatCount="indefinite" />
                              <animate attributeName="fill-opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
                            </circle>
                            <circle cx={px} cy={py} r="5.5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                            <foreignObject
                              x={px - 60}
                              y={py - 27}
                              width={120}
                              height={20}
                              className="overflow-visible select-none pointer-events-none"
                            >
                              <div className="flex justify-center items-center h-full text-[9px] font-bold text-emerald-800 bg-white/95 border border-emerald-100 rounded px-1.5 shadow-sm">
                                Max (<MathLaTeX math={formatValue(pt.y)} />)
                              </div>
                            </foreignObject>
                          </g>
                        );
                      }
                      return null;
                    })}
                    {(highlightMinPts || []).map((pt, idx) => {
                      const px = xToPixel(pt.x) - svgLeft;
                      const py = mapYToPixel(pt.y);
                      const startPx = colCenters[0] - svgLeft;
                      const endPx = colCenters[colCenters.length - 1] - svgLeft;
                      if (px >= startPx && px <= endPx && py >= 0 && py <= svgHeight) {
                        return (
                          <g key={`min-highlight-${idx}`}>
                            <circle cx={px} cy={py} r="5.5" fill="#ef4444" fillOpacity="0.4">
                              <animate attributeName="r" values="5.5;14;5.5" dur="2s" repeatCount="indefinite" />
                              <animate attributeName="fill-opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
                            </circle>
                            <circle cx={px} cy={py} r="5.5" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
                            <foreignObject
                              x={px - 60}
                              y={py + 8}
                              width={120}
                              height={20}
                              className="overflow-visible select-none pointer-events-none"
                            >
                              <div className="flex justify-center items-center h-full text-[9px] font-bold text-rose-800 bg-white/95 border border-rose-100 rounded px-1.5 shadow-sm">
                                Min (<MathLaTeX math={formatValue(pt.y)} />)
                              </div>
                            </foreignObject>
                          </g>
                        );
                      }
                      return null;
                    })}

                    {/* 7. Hover pulsating dot */}
                    {hoverX !== null && hoverYVal !== null && !isNaN(hoverYVal) && (
                      <g>
                        <circle 
                          cx={hoverX - svgLeft} 
                          cy={mapYToPixel(hoverYVal)} 
                          r="4.5" 
                          fill="rgba(79, 70, 229, 0.4)" 
                          fillOpacity="0.4"
                        >
                          <animate attributeName="r" values="4.5;12;4.5" dur="1.8s" repeatCount="indefinite" />
                          <animate attributeName="fill-opacity" values="0.4;0;0.4" dur="1.8s" repeatCount="indefinite" />
                        </circle>
                        <circle 
                          cx={hoverX - svgLeft} 
                          cy={mapYToPixel(hoverYVal)} 
                          r="4.5" 
                          fill="#4f46e5" 
                          stroke="#ffffff" 
                          strokeWidth="1.5" 
                        />
                      </g>
                    )}
                  </svg>

                  
                  {/* Floating toolbar removed and relocated to card header */}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-slate-400 text-xs animate-pulse font-medium">Đang khởi tạo liên kết đồ thị...</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Interactive Vertical Cursor Indicator */}
        {showGraph && hoverX !== null && (
          <div 
            className="absolute top-0 bottom-0 pointer-events-none border-l-2 border-dashed border-indigo-400/80 z-10"
            style={{ left: `${hoverX}px` }}
          >
            {/* Floating X label pill */}
            <div className="absolute top-1 -translate-x-1/2 bg-indigo-600/90 text-white font-mono text-[9px] px-1.5 py-0.5 rounded shadow-md font-bold whitespace-nowrap">
              x = {hoverXVal?.toFixed(2)}
            </div>
          </div>
        )}

        {/* Floating tooltip coordinates */}
        {showGraph && hoverX !== null && hoverYVal !== null && !isNaN(hoverYVal) && (
          <div 
            className="absolute pointer-events-none bg-slate-900/95 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-xl border border-slate-800 z-20 flex flex-col gap-0.5 backdrop-blur-sm transition-all duration-75 animate-in fade-in zoom-in-95 duration-100"
            style={{ 
              left: `${hoverX + 12}px`, 
              top: `${Math.max(10, Math.min(190, mapYToPixel(hoverYVal) + 10))}px` 
            }}
          >
            <div className="text-[10px] text-slate-400 font-medium">Toạ độ điểm</div>
            <div className="font-mono">
              ({hoverXVal?.toFixed(2)}; {hoverYVal?.toFixed(2)})
            </div>
          </div>
        )}

        {/* ROW 1: HOÀNH ĐỘ X */}
        {/* Header column */}
        <div className="flex items-center justify-center bg-slate-100/70 border-r border-b border-slate-200 font-bold text-slate-700 py-3">
          <MathLaTeX math="x" />
        </div>
        {/* Point & Interval columns */}
        {x_points.map((p, i) => (
          <div key={`x-col-${p.id}`} className="contents">
            {/* Point cell */}
            <div data-bbt-col={i} className={`flex items-center justify-center py-2 px-1 border-b border-slate-200 ${i === N - 1 ? '' : 'border-r border-slate-200/60'}`}>
              {renderCellContent(`x-${i}`, p.latex, 'x', i)}
            </div>
            {/* Interval cell filler */}
            {i < N - 1 && (
              <div className="flex items-center justify-center bg-slate-50/20 border-b border-slate-200 border-r border-slate-200/60">
                {/* Empty filler */}
              </div>
            )}
          </div>
        ))}

        {/* ROW 2: ĐẠO HÀM Y' */}
        {/* Header column */}
        <div className="flex items-center justify-center bg-slate-100/70 border-r border-b border-slate-200 font-bold text-slate-700 py-3">
          <MathLaTeX math="y'" />
        </div>
        {/* Point & Interval columns */}
        {x_points.map((p, i) => {
          const pointSymbol = y_prime.points[i];
          const intervalSymbol = y_prime.intervals[i];
          const cellId = `y_prime_point-${i}`;
          const isShowingDoubleLine = pointSymbol === 'd' && !(isStudentMode && maskedCellIds.has(cellId));
          return (
            <div key={`y_prime-col-${p.id}`} className="contents">
              {/* Point symbol */}
              <div className={`flex justify-center px-1 ${
                isShowingDoubleLine
                  ? 'items-stretch py-0'
                  : 'items-center py-2 border-b border-slate-200'
              } ${i === N - 1 ? '' : 'border-r border-slate-200/60'}`}>
                {renderCellContent(cellId, pointSymbol, 'y_prime_point', i)}
              </div>
              {/* Interval symbol */}
              {i < N - 1 && (
                <div className="flex items-center justify-center select-none bg-slate-50/10 border-b border-slate-200 border-r border-slate-200/60">
                  {renderCellContent(`y_prime_interval-${i}`, intervalSymbol, 'y_prime_interval', i)}
                </div>
              )}
            </div>
          );
        })}

        {/* ROW 3: BIẾN THIÊN Y */}
        {/* Header column */}
        <div className="flex items-center justify-center bg-slate-100/70 border-r border-slate-200 font-bold text-slate-700 py-3 min-h-[220px]">
          <MathLaTeX math="y" />
        </div>
        {/* Point & Interval columns */}
        {x_points.map((p, i) => {
          const yVal = y_row.points[i];
          const isDiscontinuity = yVal?.type === 'discontinuity';
          const intervalSymbol = y_prime.intervals[i];

          // Determine arrow Y points
          let startY = 110;
          if (yVal) {
            if (yVal.type === 'single') {
              startY = getPositionY(yVal.position);
            } else if (yVal.type === 'discontinuity') {
              startY = getPositionY(yVal.positionRight);
            }
          }

          let endY = 110;
          const nextYVal = y_row.points[i + 1];
          if (nextYVal) {
            if (nextYVal.type === 'single') {
              endY = getPositionY(nextYVal.position);
            } else if (nextYVal.type === 'discontinuity') {
              endY = getPositionY(nextYVal.positionLeft);
            }
          }

          return (
            <div key={`y_val-col-${p.id}`} className="contents">
              {/* Point values & Double line */}
              {isDiscontinuity ? (
                /* Render Discontinuity cell */
                <div className="h-[220px] relative border-r border-slate-200/60 flex justify-center items-stretch min-w-[96px] select-all px-1">
                  {/* Left Limit */}
                  <div className="flex-1 flex justify-center py-2 h-full relative min-w-[36px]">
                    <div 
                      className="absolute left-1/2 -translate-x-1/2 w-full flex justify-center"
                      style={{ 
                        top: yVal.type === 'discontinuity' ? `${getPositionY(yVal.positionLeft) - 16}px` : '110px'
                      }}
                    >
                      {renderCellContent(
                        `y_value-${i}-left`, 
                        (yVal as any).latexLeft, 
                        'y_value', 
                        i, 
                        'left'
                      )}
                    </div>
                  </div>
                  
                  {/* Double Line */}
                  <div className="flex justify-center items-center h-full gap-[3px] select-none px-1">
                    <div className="w-[1.2px] h-full bg-slate-300 dark:bg-slate-600"></div>
                    <div className="w-[1.2px] h-full bg-slate-300 dark:bg-slate-600"></div>
                  </div>
                  
                  {/* Right Limit */}
                  <div className="flex-1 flex justify-center py-2 h-full relative min-w-[36px]">
                    <div 
                      className="absolute left-1/2 -translate-x-1/2 w-full flex justify-center"
                      style={{ 
                        top: yVal.type === 'discontinuity' ? `${getPositionY(yVal.positionRight) - 16}px` : '110px'
                      }}
                    >
                      {renderCellContent(
                        `y_value-${i}-right`, 
                        (yVal as any).latexRight, 
                        'y_value', 
                        i, 
                        'right'
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Render Single value cell */
                <div className={`h-[220px] relative select-all ${i === N - 1 ? '' : 'border-r border-slate-200/60'}`}>
                  <div 
                    className="absolute left-1/2 -translate-x-1/2 w-full flex justify-center px-1"
                    style={{ 
                      top: yVal?.type === 'single' ? `${getPositionY(yVal.position) - 16}px` : '110px' 
                    }}
                  >
                    {yVal && renderCellContent(
                      `y_value-${i}`, 
                      (yVal as any).latex, 
                      'y_value', 
                      i, 
                      'single'
                    )}
                  </div>
                </div>
              )}

              {/* SVG Arrow in interval column */}
              {i < N - 1 && (
                <div data-bbt-interval={i} className="h-[220px] relative select-none border-r border-slate-200/60">
                  {intervalSymbol !== 'h' ? (
                    <div className="w-full h-full relative py-2">
                      <svg className="w-full h-full text-slate-400 dark:text-slate-500" viewBox="0 0 100 220" preserveAspectRatio="none">
                        <defs>
                          <marker 
                            id={`arrow-${i}`} 
                            viewBox="0 0 10 10" 
                            refX="6" 
                            refY="5" 
                            markerWidth="5" 
                            markerHeight="5" 
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="currentColor" />
                          </marker>
                        </defs>
                        <path
                          d={`M 15,${startY} L 85,${endY}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeDasharray={intervalSymbol === '+' || intervalSymbol === '-' ? undefined : "3 3"}
                          markerEnd={`url(#arrow-${i})`}
                        />

                        {/* Interactive matching cursor dot on arrow */}
                        {hoverX !== null && intervalBounds[i] && activeIntervalIdx === i && (() => {
                          const u = Math.max(0, Math.min(1, (hoverX - intervalBounds[i].left) / (intervalBounds[i].width || 1)));
                          const dotX = 15 + u * 70;
                          const dotY = startY + u * (endY - startY);
                          return (
                            <g key="hover-arrow-dot">
                              {/* Outer pulsating ring */}
                              <circle 
                                cx={dotX} 
                                cy={dotY} 
                                r="4.5" 
                                fill="rgba(79, 70, 229, 0.4)" 
                                fillOpacity="0.4"
                              >
                                <animate attributeName="r" values="4.5;12;4.5" dur="1.8s" repeatCount="indefinite" />
                                <animate attributeName="fill-opacity" values="0.4;0;0.4" dur="1.8s" repeatCount="indefinite" />
                              </circle>
                              {/* Inner solid dot */}
                              <circle 
                                cx={dotX} 
                                cy={dotY} 
                                r="4.5" 
                                fill="#4f46e5" 
                                stroke="#ffffff" 
                                strokeWidth="1.5" 
                              />
                            </g>
                          );
                        })()}
                      </svg>
                    </div>
                  ) : (
                    // Forbidden region in y
                    <div className="absolute inset-y-0 inset-x-0 opacity-10 bg-[repeating-linear-gradient(45deg,#000,#000_4px,transparent_4px,transparent_8px)]" />
                  )}
                </div>
              )}
            </div>
          );
        })}

      </div>
  );
  const renderGraphToolbar = () => {
    if (!showGraph) return null;
    return (
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between no-print text-xs gap-3 select-none">
        <div className="flex items-center gap-1.5 text-slate-700">
          <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
          <span className="font-bold text-[10px] uppercase tracking-wider text-slate-500">Tùy chỉnh đồ thị</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Scale Mode Picker */}
          <div className="flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-indigo-500" />
            <span className="font-semibold text-slate-500">Tỉ lệ:</span>
            <div className="flex gap-0.5 bg-slate-250 p-0.5 rounded-lg border border-slate-200/50">
              <button
                onClick={() => setScaleMode('linear')}
                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${
                  scaleMode === 'linear'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Đồ thị tuyến tính phẳng không bị méo lệch cột"
              >
                Tuyến tính
              </button>
              <button
                onClick={() => setScaleMode('bbt')}
                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${
                  scaleMode === 'bbt'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Căn dóng thẳng hàng tuyệt đối với các cột hoành độ BBT"
              >
                Căn dóng BBT
              </button>
            </div>
          </div>

          {/* Y Axis Mode Picker */}
          {scaleMode === 'linear' && (
            <div className="flex items-center gap-1.5 border-l border-slate-250 pl-3">
              <span className="font-semibold text-slate-500">Trục Y:</span>
              <div className="flex gap-0.5 bg-slate-250 p-0.5 rounded-lg border border-slate-200/50">
                <button
                  onClick={() => setAutoFitY(true)}
                  className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${
                    autoFitY
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Tự động giãn tỉ lệ để hiển thị trọn vẹn cực trị lớn"
                >
                  Tự động khít
                </button>
                <button
                  onClick={() => setAutoFitY(false)}
                  className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${
                    !autoFitY
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Khóa tỉ lệ x:y = 1:1 chuẩn sách giáo khoa"
                >
                  Khóa 1:1
                </button>
              </div>
            </div>
          )}

          {/* Number Display Format Picker */}
          <div className="flex items-center gap-1.5 border-l border-slate-250 pl-3">
            <span className="font-semibold text-slate-500">Định dạng số:</span>
            <div className="flex gap-0.5 bg-slate-250 p-0.5 rounded-lg border border-slate-200/50">
              <button
                onClick={() => setDisplayFormat('fraction')}
                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${
                  displayFormat === 'fraction'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Hiển thị dạng phân số toán học chính xác"
              >
                Phân số
              </button>
              <button
                onClick={() => setDisplayFormat('decimal')}
                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${
                  displayFormat === 'decimal'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Hiển thị dạng số thập phân xấp xỉ"
              >
                Thập phân
              </button>
            </div>
          </div>

          {/* Decimal Places Rounding Control */}
          {displayFormat === 'decimal' && (
            <div className="flex items-center gap-1.5 border-l border-slate-250 pl-3">
              <span className="font-semibold text-slate-500">Làm tròn:</span>
              <div className="flex items-center gap-1 bg-slate-250 p-0.5 rounded-lg border border-slate-200/50 h-7">
                <button
                  onClick={() => setDecimalPlaces(prev => Math.max(0, prev - 1))}
                  className="w-5 h-5 flex items-center justify-center font-bold text-slate-650 hover:bg-white rounded transition-all text-xs"
                  title="Giảm số chữ số thập phân"
                >
                  -
                </button>
                <span className="w-6 text-center font-mono font-bold text-slate-800 text-[11px]">
                  {decimalPlaces}
                </span>
                <button
                  onClick={() => setDecimalPlaces(prev => Math.min(6, prev + 1))}
                  className="w-5 h-5 flex items-center justify-center font-bold text-slate-650 hover:bg-white rounded transition-all text-xs"
                  title="Tăng số chữ số thập phân"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Zoom Controls */}
          {scaleMode === 'linear' && (
            <div className="flex items-center gap-2 border-l border-slate-250 pl-3">
              <span className="font-semibold text-slate-500">Thu phóng:</span>
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-0.5 shadow-sm">
                <button
                  onClick={() => setZoomFactor(prev => Math.max(0.3, prev - 0.1))}
                  className="p-0.5 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600 transition-colors"
                  title="Thu nhỏ"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] font-bold text-slate-750 min-w-[32px] text-center">
                  {(zoomFactor * 100).toFixed(0)}%
                </span>
                <button
                  onClick={() => setZoomFactor(prev => Math.min(3.0, prev + 0.1))}
                  className="p-0.5 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600 transition-colors"
                  title="Phóng to"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomFactor(1.0)}
                  className="p-0.5 border-l border-slate-200 pl-1.5 ml-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors"
                  title="Đặt lại tỉ lệ 1:1 mặc định"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Fullscreen Workspace Button */}
          <div className="flex items-center border-l border-slate-250 pl-3">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="px-2.5 py-1 hover:bg-slate-100 rounded-lg border border-slate-200 bg-white text-slate-650 hover:text-indigo-650 transition-all flex items-center gap-1 shadow-sm font-bold"
              title={isFullscreen ? "Thu nhỏ chế độ toàn màn hình" : "Phóng to toàn màn hình làm việc (Đồ thị & BBT)"}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
              <span className="text-[10px] uppercase tracking-wider">Fullscreen</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-slate-100/95 backdrop-blur-md z-50 p-4 sm:p-6 overflow-y-auto flex flex-col justify-start items-center gap-4 animate-in fade-in duration-200 no-print">
        <div className="w-full max-w-[95%] bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 sm:p-6 flex flex-col gap-4">
          {/* Workspace header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-xs select-all">
                  f(x) = {analysis.functionStr}
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  {isTeacherMode ? '(Giáo viên)' : isStudentMode ? '(Học sinh)' : '(Hiển thị)'}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 font-sans">
                Toàn Màn Hình: Đồ Thị &amp; Bảng Biến Thiên
              </h2>
            </div>
            <button
              onClick={() => setIsFullscreen(false)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all shadow-sm border border-slate-200/50"
              title="Thoát toàn màn hình"
            >
              <Minimize2 className="w-4 h-4 text-slate-500" />
              <span>Thu nhỏ</span>
            </button>
          </div>
          
          {/* Main Visual Board */}
          <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            {renderGraphToolbar()}
            {mainContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm print-card">
      {renderGraphToolbar()}
      {mainContent}
    </div>
  );
}
