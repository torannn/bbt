import React, { useRef, useEffect, useState } from 'react';
import 'mathlive';

// @ts-ignore
if (window.MathfieldElement) {
  // @ts-ignore
  window.MathfieldElement.fontsDirectory = 'https://unpkg.com/mathlive@0.110.0/dist/fonts/';
}
import { Sparkles, Keyboard, Info, Undo, Redo, Copy, Clipboard, Check } from 'lucide-react';

interface MathWYSIWYMInputProps {
  value: string;
  onChange: (newValue: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  inputRef?: React.RefObject<any>;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        class?: string;
        onInput?: (e: Event) => void;
        onKeyPress?: (e: KeyboardEvent) => void;
        onFocus?: (e: Event) => void;
        onBlur?: (e: Event) => void;
        'read-only'?: string;
      };
      [elemName: string]: any;
    }
  }
}

export function MathWYSIWYMInput({ value, onChange, onSubmit, disabled, inputRef }: MathWYSIWYMInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [inputMode, setInputMode] = useState<'math' | 'text' | 'latex'>('math');
  const [copied, setCopied] = useState(false);

  const localRef = useRef<any>(null);
  const mathFieldRef = inputRef || localRef;
  const lastBroadcastValue = useRef<string>(value);
  const helpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showHelp) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showHelp]);

  useEffect(() => {
    const handleKeyboardToggle = () => {
      // @ts-ignore
      if (window.mathVirtualKeyboard) {
        // @ts-ignore
        setIsKeyboardVisible(window.mathVirtualKeyboard.visible);
      }
    };

    // @ts-ignore
    if (window.mathVirtualKeyboard) {
      // @ts-ignore
      setIsKeyboardVisible(window.mathVirtualKeyboard.visible);
      // @ts-ignore
      window.mathVirtualKeyboard.addEventListener('virtual-keyboard-toggle', handleKeyboardToggle);
    }

    return () => {
      // @ts-ignore
      if (window.mathVirtualKeyboard) {
        // @ts-ignore
        window.mathVirtualKeyboard.removeEventListener('virtual-keyboard-toggle', handleKeyboardToggle);
      }
    };
  }, []);

  useEffect(() => {
    const mf = mathFieldRef.current;
    if (!mf) return;

    // Disable the virtual keyboard from popping up automatically on desktop
    // and customize the layout list globally to hide the toggle tabs menu.
    // @ts-ignore
    if (window.mathVirtualKeyboard) {
      // @ts-ignore
      window.mathVirtualKeyboard.mathVirtualKeyboardPolicy = 'manual';
      // @ts-ignore
      window.mathVirtualKeyboard.virtualKeyboardToolbar = 'none';
      // @ts-ignore
      window.mathVirtualKeyboard.layouts = [
        {
          label: 'BBT',
          tooltip: 'Bàn phím khảo sát Bảng Biến Thiên',
          layers: [
            {
              rows: [
                // Row 1 (Left 2, Spacer 0.5, Middle 4, Spacer 0.5, Right 4)
                [
                  // Left variables
                  { latex: 'x' },
                  { latex: 'y' },
                  // Spacer
                  { width: 0.5, class: 'spacer' },
                  // Middle numberpad row 1
                  { latex: '7' },
                  { latex: '8' },
                  { latex: '9' },
                  { latex: '/', label: '÷' },
                  // Spacer
                  { width: 0.5, class: 'spacer' },
                  // Right core functions row 1
                  { latex: 'x^2', insert: '#@^2' },
                  { latex: 'x^y', insert: '#@^{#?}' },
                  { latex: '\\frac{x}{y}', insert: '\\frac{#@}{#?}' },
                  { class: 'action font-sans text-xs', command: ['performWithFeedback', 'deleteBackward'], label: '⌫' }
                ],
                // Row 2 (Left 2, Spacer 0.5, Middle 4, Spacer 0.5, Right 4)
                [
                  // Left constants
                  { latex: 'e' },
                  { latex: 'i' },
                  // Spacer
                  { width: 0.5, class: 'spacer' },
                  // Middle numberpad row 2
                  { latex: '4' },
                  { latex: '5' },
                  { latex: '6' },
                  { latex: '*', label: '×' },
                  // Spacer
                  { width: 0.5, class: 'spacer' },
                  // Right core functions row 2
                  { latex: '\\sqrt{x}', insert: '\\sqrt{#@}' },
                  { latex: '\\sqrt[y]{x}', insert: '\\sqrt[#?]{#@}' },
                  { latex: 'a^x', insert: '{#?}^{#@}' },
                  { latex: 'e^x', insert: 'e^{#@}' }
                ],
                // Row 3 (Left 2, Spacer 0.5, Middle 4, Spacer 0.5, Right 4)
                [
                  // Left constants row 3
                  { latex: '\\pi' },
                  { latex: 'n' },
                  // Spacer
                  { width: 0.5, class: 'spacer' },
                  // Middle numberpad row 3
                  { latex: '1' },
                  { latex: '2' },
                  { latex: '3' },
                  { latex: '-' },
                  // Spacer
                  { width: 0.5, class: 'spacer' },
                  // Right core functions row 3
                  { latex: '\\ln x', insert: '\\ln(#@)' },
                  { latex: '\\log x', insert: '\\log(#@)' },
                  { latex: '\\log_a x', insert: '\\log_{#?}(#@)' },
                  { class: 'action font-sans text-xs', command: ['performWithFeedback', 'moveToPreviousChar'], label: '◄' }
                ],
                // Row 4 (Left 2, Spacer 0.5, Middle 4, Spacer 0.5, Right 4)
                [
                  // Left brackets
                  { latex: '(' },
                  { latex: ')' },
                  // Spacer
                  { width: 0.5, class: 'spacer' },
                  // Middle numberpad row 4
                  { latex: '0' },
                  { latex: '.' },
                  { latex: '=' },
                  { latex: '+' },
                  // Spacer
                  { width: 0.5, class: 'spacer' },
                  // Right core functions/actions row 4
                  { class: 'action font-sans text-xs', command: ['insert', ' '], label: 'Space' },
                  { class: 'action font-sans text-xs', command: ['performWithFeedback', 'moveToNextChar'], label: '►' },
                  { class: 'action font-sans text-xs', command: ['performWithFeedback', 'deleteAll'], label: 'Xóa' },
                  { class: 'action font-sans text-xs', command: ['performWithFeedback', 'commit'], label: 'Enter' }
                ]
              ]
            }
          ]
        }
      ];
    }

    // @ts-ignore
    mf.virtualKeyboards = 'all';
    // @ts-ignore
    mf.virtualKeyboardToolbar = 'none';

    const handleInput = (ev: Event) => {
      // Get ascii math string that cas.ts (mathjs) can understand
      const asciiMath = mf.getValue('ascii-math');
      lastBroadcastValue.current = asciiMath;
      onChange(asciiMath);
    };

    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && onSubmit) {
        ev.preventDefault();
        onSubmit();
      }
    };

    const handleFocus = () => {
      setIsFocused(true);
      // @ts-ignore
      if (window.mathVirtualKeyboard) {
        // @ts-ignore
        setIsKeyboardVisible(window.mathVirtualKeyboard.visible);
      }
    };
    const handleBlur = () => setIsFocused(false);

    mf.addEventListener('input', handleInput);
    mf.addEventListener('keydown', handleKeyDown);
    mf.addEventListener('focus', handleFocus);
    mf.addEventListener('blur', handleBlur);

    return () => {
      mf.removeEventListener('input', handleInput);
      mf.removeEventListener('keydown', handleKeyDown);
      mf.removeEventListener('focus', handleFocus);
      mf.removeEventListener('blur', handleBlur);
    };
  }, [onChange, onSubmit, mathFieldRef]);

  useEffect(() => {
    const mf = mathFieldRef.current;
    if (!mf) return;
    
    // Only update value from external changes (e.g. clicking templates)
    // We avoid updating if the value is the one we just broadcasted to prevent cursor jumps and parsing loops
    if (value !== lastBroadcastValue.current) {
      lastBroadcastValue.current = value;
      mf.setValue(value, { format: 'ascii-math' });
    }
  }, [value, mathFieldRef]);

  const toggleVirtualKeyboard = () => {
    // @ts-ignore
    if (window.mathVirtualKeyboard) {
      // @ts-ignore
      if (window.mathVirtualKeyboard.visible) {
        // @ts-ignore
        window.mathVirtualKeyboard.hide();
      } else {
        // @ts-ignore
        window.mathVirtualKeyboard.show();
        mathFieldRef.current?.focus();
      }
    }
  };

  const handleSetMode = (mode: 'math' | 'text' | 'latex') => {
    setInputMode(mode);
    const mf = mathFieldRef.current;
    if (mf) {
      mf.executeCommand(['switchMode', mode]);
      mf.focus();
    }
  };

  const handleUndo = () => {
    const mf = mathFieldRef.current;
    if (mf) {
      mf.executeCommand('undo');
      mf.focus();
    }
  };

  const handleRedo = () => {
    const mf = mathFieldRef.current;
    if (mf) {
      mf.executeCommand('redo');
      mf.focus();
    }
  };

  const handleCopy = () => {
    const mf = mathFieldRef.current;
    if (mf) {
      const latex = mf.getValue('latex');
      navigator.clipboard.writeText(latex).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      const mf = mathFieldRef.current;
      if (mf) {
        mf.insert(text);
        mf.focus();
      }
    });
  };

  return (
    <div className="flex flex-col gap-2.5 w-full relative">
      {/* 1. UNIFIED ACTION TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between no-print text-xs text-slate-500 bg-slate-100/90 backdrop-blur-sm px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm gap-3 select-none">
        
        {/* Left: Input Mode Switcher */}
        <div className="flex items-center gap-2">
          <span className="font-bold text-[9px] uppercase tracking-wider text-slate-400 select-none">Nhập:</span>
          <div className="flex bg-slate-200 p-0.5 rounded-lg border border-slate-200/50">
            <button
              type="button"
              onClick={() => handleSetMode('math')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                inputMode === 'math' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Math
            </button>
            <button
              type="button"
              onClick={() => handleSetMode('text')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                inputMode === 'text' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Text
            </button>
            <button
              type="button"
              onClick={() => handleSetMode('latex')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                inputMode === 'latex' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              LaTeX
            </button>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5">
          {/* Undo */}
          <button
            type="button"
            onClick={handleUndo}
            className="p-1.5 hover:bg-slate-200 hover:text-indigo-600 rounded-lg transition-colors text-slate-500 cursor-pointer"
            title="Hoàn tác (Undo)"
          >
            <Undo className="w-3.5 h-3.5" />
          </button>
          {/* Redo */}
          <button
            type="button"
            onClick={handleRedo}
            className="p-1.5 hover:bg-slate-200 hover:text-indigo-600 rounded-lg transition-colors text-slate-500 cursor-pointer"
            title="Làm lại (Redo)"
          >
            <Redo className="w-3.5 h-3.5" />
          </button>
          {/* Divider */}
          <div className="w-[1px] h-3.5 bg-slate-200" />
          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 hover:bg-slate-200 hover:text-indigo-600 rounded-lg transition-colors text-slate-500 relative cursor-pointer"
            title="Sao chép LaTeX"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {/* Paste */}
          <button
            type="button"
            onClick={handlePaste}
            className="p-1.5 hover:bg-slate-200 hover:text-indigo-600 rounded-lg transition-colors text-slate-500 cursor-pointer"
            title="Dán công thức"
          >
            <Clipboard className="w-3.5 h-3.5" />
          </button>
          {/* Divider */}
          <div className="w-[1px] h-3.5 bg-slate-200" />
          {/* Keyboard toggle */}
          <button
            type="button"
            onClick={toggleVirtualKeyboard}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
              isKeyboardVisible ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700' : 'hover:bg-slate-200 hover:text-indigo-600 text-slate-500'
            }`}
            title="Bật/Tắt bàn phím ảo"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>
          
          {/* Info shortcuts */}
          <div className="relative" ref={helpRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowHelp(prev => !prev);
              }}
              className={`p-1.5 rounded-lg transition-colors flex items-center cursor-pointer ${
                showHelp ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700' : 'hover:bg-slate-200 hover:text-indigo-600 text-slate-500'
              }`}
              title="Xem phím tắt & Hướng dẫn"
            >
              <Info className="w-3.5 h-3.5" />
            </button>

            {showHelp && (
              <div 
                className="absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-4 z-50 text-xs text-slate-655 transition-all duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <span className="font-bold text-slate-800 text-sm">Phím Tắt Nhập Liệu</span>
                  <button 
                    type="button"
                    onClick={() => setShowHelp(false)}
                    className="text-slate-400 hover:text-slate-600 font-bold"
                  >
                    ×
                  </button>
                </div>
                <ul className="space-y-1.5">
                  <li className="flex justify-between"><span className="font-semibold text-slate-700">Phân số (a/b)</span> <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">a / b</kbd></li>
                  <li className="flex justify-between"><span className="font-semibold text-slate-700">Mũ / Lũy thừa (x²)</span> <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">x ^ 2</kbd></li>
                  <li className="flex justify-between"><span className="font-semibold text-slate-700">Căn bậc hai (√x)</span> <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">sqrt(x)</kbd></li>
                  <li className="flex justify-between"><span className="font-semibold text-slate-700">Nhân (a*b)</span> <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">a * b</kbd></li>
                  <li className="flex justify-between"><span className="font-semibold text-slate-700">Thoát phân số/mũ</span> <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">→ (Mũi tên phải)</kbd></li>
                  <li className="flex justify-between"><span className="font-semibold text-slate-700">Số Pi (π)</span> <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">pi</kbd></li>
                </ul>
                <p className="text-[10px] text-slate-400 mt-2.5 border-t border-slate-100 pt-1.5 text-center font-medium">
                  Dùng phím mũi tên <kbd className="px-1 bg-slate-50 border rounded">→</kbd> hoặc phím cách <kbd className="px-1 bg-slate-50 border rounded">Space</kbd> để di chuyển con trỏ ra ngoài phân số.
                </p>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* 2. THE ACTUAL INPUT BAR */}
      <div
        className={`relative w-full min-h-[56px] px-4 py-1 bg-white border rounded-2xl cursor-text transition-all duration-250 flex items-center shadow-sm ${
          isFocused
            ? 'ring-4 ring-indigo-50 border-indigo-500 shadow-indigo-50/50 bg-indigo-50/5'
            : 'border-slate-300 hover:border-slate-400 bg-slate-50/30'
        } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
        onClick={() => mathFieldRef.current?.focus()}
      >
        {/* Left Prefix math decorator like Desmos */}
        <div className="flex items-center gap-1.5 mr-3 border-r border-slate-200/80 pr-3 text-indigo-500 font-serif font-bold italic text-base select-none">
          <span>f</span>
          <span className="text-xs text-indigo-400 font-sans font-semibold not-italic">(x)</span>
          <span className="text-slate-300 font-normal font-sans not-italic">=</span>
        </div>

        <div className="flex-grow flex items-center pr-8 overflow-hidden text-lg">
          <math-field
            ref={mathFieldRef}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              width: '100%',
              fontFamily: 'inherit',
              userSelect: 'text',
              WebkitUserSelect: 'text',
            }}
            read-only={disabled ? "" : undefined}
            show-virtual-keyboard-toggle="false"
          />
        </div>

        <div className="absolute right-3 top-1/2 -translate-y-1/2 select-none">
          <Sparkles className={`w-4 h-4 text-indigo-500 transition-opacity duration-300 ${isFocused ? 'opacity-100 animate-pulse' : 'opacity-35'}`} />
        </div>
      </div>
    </div>
  );
}
