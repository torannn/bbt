import React from 'react';
import { ExplanationStep } from '../types';
import { MathLaTeX } from './MathLaTeX';
import { GraduationCap, ArrowDownRight, ChevronRight } from 'lucide-react';

interface ExplanationPanelProps {
  steps: ExplanationStep[];
  bbtElement?: React.ReactNode;
}

export function renderRichText(text: string) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, lIdx) => {
    const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
    const textToProcess = isBullet ? line.trim().replace(/^(-\s*|\*\s*)/, '') : line;

    const mathParts = textToProcess.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
    const lineContent = mathParts.map((part, pIdx) => {
      const isDisplayMath = part.startsWith('$$') && part.endsWith('$$');
      const isInlineMath = part.startsWith('$') && part.endsWith('$');
      if (isDisplayMath) {
        return <React.Fragment key={`math-${lIdx}-${pIdx}`}><MathLaTeX block math={part.slice(2, -2)} /></React.Fragment>;
      } else if (isInlineMath) {
        return <React.Fragment key={`math-${lIdx}-${pIdx}`}><MathLaTeX math={part.slice(1, -1)} /></React.Fragment>;
      } else {
        const boldParts = part.split(/\*\*(.*?)\*\*/g);
        return boldParts.map((bPart, bIdx) => {
          if (bIdx % 2 === 1) {
            return <strong key={`bold-${lIdx}-${pIdx}-${bIdx}`} className="font-bold text-slate-800">{bPart}</strong>;
          }
          return <span key={`text-${lIdx}-${pIdx}-${bIdx}`}>{bPart}</span>;
        });
      }
    });

    if (isBullet) {
      return (
        <span key={`line-${lIdx}`} className="flex items-start gap-1.5 pl-2 mt-1">
          <span className="text-indigo-500 mt-1 select-none flex-shrink-0"><ChevronRight className="w-3.5 h-3.5" /></span>
          <span className="flex-grow leading-relaxed">{lineContent}</span>
        </span>
      );
    }
    
    if (line.trim() === '') {
       return <div key={`line-${lIdx}`} className="h-2" />;
    }

    return (
      <span key={`line-${lIdx}`} className="block mt-1 leading-relaxed">
        {lineContent}
      </span>
    );
  });
}

export function ExplanationPanel({ steps, bbtElement }: ExplanationPanelProps) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full relative">
      <div className="absolute top-0 left-0 w-1 bg-indigo-500 h-full"></div>
      
      {/* Header */}
      <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shadow-sm border border-indigo-100/50">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-lg text-slate-800">
              Phân Tích Hàm Số
            </h3>
            <p className="text-xs text-slate-400">
              Các bước phân tích và lập bảng biến thiên của hàm số
            </p>
          </div>
        </div>
      </div>

      {/* Steps Content */}
      <div className="p-4 md:p-6 overflow-y-auto flex-grow bg-white">
        <div className="relative">
          {/* Vertical connecting line */}
          <div className="absolute left-[13px] top-6 bottom-4 w-px bg-slate-200/60 z-0 hidden md:block"></div>
          
          <div className="flex flex-col gap-6 md:gap-8">
            {steps.map((step, idx) => (
              <div key={idx} className="relative z-10 flex gap-4 md:gap-6 group">
                {/* Step indicator */}
                <div className="hidden md:flex flex-col items-center mt-0.5">
                  <div className="w-7 h-7 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:bg-indigo-50 transition-all duration-300">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                  </div>
                </div>
                
                {/* Step Content */}
                <div className="flex flex-col gap-2 flex-grow max-w-full overflow-hidden">
                  {/* Step Title */}
                  <h4 className="font-display font-bold text-slate-800 text-sm md:text-base flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100/50">
                      Bước {idx + 1}
                    </span>
                    {step.title.replace(/^Bước \d+:?\s*/, '')}
                  </h4>
                  
                  {/* Step Content */}
                  <div className="text-slate-600 text-sm pl-1 pr-2 md:pr-4 overflow-x-auto">
                    {idx === 3 && bbtElement && (
                      <div className="mb-4 mt-2">
                        {bbtElement}
                      </div>
                    )}
                    {renderRichText(step.content)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Footer Hint */}
      <div className="bg-slate-50 border-t border-slate-100 p-3 flex justify-center text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <ArrowDownRight className="w-3.5 h-3.5" /> Cuộn xuống để xem bảng biến thiên chi tiết
        </span>
      </div>
    </div>
  );
}
