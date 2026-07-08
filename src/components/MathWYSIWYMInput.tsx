import React, { useRef, useEffect, useState } from 'react';
import 'mathlive';

// @ts-ignore
if (window.MathfieldElement) {
  // @ts-ignore
  window.MathfieldElement.fontsDirectory = 'https://unpkg.com/mathlive@0.110.0/dist/fonts/';
}
import { Sparkles } from 'lucide-react';

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

export function MathWYSIWYMInput({ value, onChange, onSubmit, disabled }: MathWYSIWYMInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const mathFieldRef = useRef<any>(null);
  const lastBroadcastValue = useRef<string>(value);

  useEffect(() => {
    const mf = mathFieldRef.current;
    if (!mf) return;

    // Disable the virtual keyboard from popping up automatically on desktop
    // which can cause errors or annoying jumps in iframes.
    // @ts-ignore
    if (window.mathVirtualKeyboard) {
      // @ts-ignore
      window.mathVirtualKeyboard.mathVirtualKeyboardPolicy = 'manual';
    }

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

    const handleFocus = () => setIsFocused(true);
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
  }, [onChange, onSubmit]);

  useEffect(() => {
    const mf = mathFieldRef.current;
    if (!mf) return;
    
    // Only update value from external changes (e.g. clicking templates)
    // We avoid updating if the value is the one we just broadcasted to prevent cursor jumps and parsing loops
    if (value !== lastBroadcastValue.current) {
      lastBroadcastValue.current = value;
      mf.setValue(value, { format: 'ascii-math' });
    }
  }, [value]);

  return (
    <div
      className={`relative w-full min-h-[56px] px-4 py-1 bg-white border rounded-2xl cursor-text transition-all duration-250 flex items-center shadow-sm select-none ${
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
          }}
          read-only={disabled ? "true" : "false"}
        />
      </div>

      {/* Right status icon */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 text-indigo-500/85">
        <Sparkles className={`w-4 h-4 ${isFocused ? 'animate-pulse' : ''}`} />
      </div>
    </div>
  );
}
