/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface XPoint {
  id: string; // unique identifier
  latex: string; // LaTeX representation, e.g. "-\\infty", "-1", "1", "+\\infty"
  type: 'infinity' | 'critical' | 'discontinuity';
  value?: number; // approx numerical value for sorting/checking if user inputs
}

export type YPrimePointSymbol = '0' | 'd' | ''; // 0: derivative is 0, d: double bar / undefined, empty: otherwise
export type YPrimeIntervalSymbol = '+' | '-' | 'h'; // +: increasing, -: decreasing, h: forbidden zone / double hatched

export interface YPrimeRow {
  points: YPrimePointSymbol[]; // of length equal to x_points
  intervals: YPrimeIntervalSymbol[]; // of length x_points.length - 1
}

export interface YValueSingle {
  type: 'single';
  latex: string; // e.g. "4", "-\\infty", "0"
  position: 'top' | 'middle' | 'bottom';
}

export interface YValueDiscontinuity {
  type: 'discontinuity';
  latexLeft: string; // limit as x approaches from left, e.g. "+\\infty"
  positionLeft: 'top' | 'middle' | 'bottom';
  latexRight: string; // limit as x approaches from right, e.g. "-\\infty"
  positionRight: 'top' | 'middle' | 'bottom';
}

export type YPointValue = YValueSingle | YValueDiscontinuity;

export interface YRow {
  points: YPointValue[]; // of length equal to x_points
}

export interface ExplanationStep {
  title: string;
  content: string; // Markdown description of the mathematical step
}

export interface FunctionAnalysis {
  functionStr: string; // input string, e.g. "x^3 - 3*x + 2"
  functionLatex: string; // parsed LaTeX of the function, e.g. "x^3 - 3x + 2"
  txd: string; // LaTeX of Domain, e.g. "D = \\mathbb{R}"
  derivative: string; // LaTeX of y', e.g. "3x^2 - 3"
  x_points: XPoint[];
  y_prime: YPrimeRow;
  y_row: YRow;
  latex_code: string; // tkz-tab LaTeX code
  explanation_steps: ExplanationStep[];
}

// Exercise / Quiz types
export type MaskType = 'x' | 'y_prime_point' | 'y_prime_interval' | 'y_value';

export interface MaskedCell {
  id: string; // e.g. "x-1", "y_prime_point-0", "y_prime_interval-0", "y_value-2-left", "y_value-2-right"
  type: MaskType;
  index: number; // index in the respective array
  subIndex?: 'left' | 'right' | 'single'; // for discontinuity limits
  originalValue: string; // the correct answer (LaTeX or plain string to match)
  placeholder: string; // custom placeholder like "?", "\fbox{?}", or "\dots"
}

export interface QuizState {
  analysis: FunctionAnalysis;
  maskedCells: MaskedCell[];
  userAnswers: Record<string, string>; // cellId -> string
  showResults: boolean;
}
