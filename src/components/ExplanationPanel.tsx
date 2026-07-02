/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExplanationStep } from '../types';
import { MathLaTeX } from './MathLaTeX';
import { GraduationCap, ArrowDownRight, ChevronRight } from 'lucide-react';

interface ExplanationPanelProps {
  steps: ExplanationStep[];
}

export function renderRichText(text: string) {
  if (!text) return null;
  
  // Split text by $$ first to isolate block math
  const blockParts = text.split(/\$\$(.*?)\$\$/gs);
  
  return blockParts.map((part, index) => {
    const isBlockMath = index % 2 === 1;
    if (isBlockMath) {
      return (
        <div key={`block-${index}`} className="my-3 overflow-x-auto max-w-full bg-slate-50 border border-slate-100 p-3 rounded-lg flex justify-center text-indigo-950 font-medium">
          <MathLaTeX math={part.trim()} block={true} />
        </div>
      );
    }
    
    // Process inline math $...$ inside the remaining text
    const inlineParts = part.split(/\$(.*?)\$/g);
    return (
      <span key={`text-block-${index}`} className="leading-relaxed">
        {inlineParts.map((subPart, subIndex) => {
          const isInlineMath = subIndex % 2 === 1;
          if (isInlineMath) {
            return (
              <span key={`inline-${index}-${subIndex}`}>
                <MathLaTeX 
                  math={subPart} 
                  block={false} 
                  className="text-indigo-900 bg-indigo-50/40 px-1 py-0.5 rounded font-medium"
                />
              </span>
            );
          }
          
          // Support normal newlines inside text
          const lines = subPart.split('\n');
          return lines.map((line, lIdx) => {
            // Check for list points or bullet points in the text and format them
            const isBullet = line.trim().startsWith('-') || line.trim().startsWith('*');
            const cleanLine = isBullet ? line.trim().substring(1).trim() : line;
            
            return (
              <span key={`line-${index}-${subIndex}-${lIdx}`} className="block mt-1">
                {isBullet ? (
                  <span className="flex items-start gap-1.5 pl-2 mt-0.5">
                    <span className="text-indigo-500 mt-1 select-none"><ChevronRight className="w-3.5 h-3.5" /></span>
                    <span>{cleanLine}</span>
                  </span>
                ) : (
                  <span>{line}</span>
                )}
              </span>
            );
          });
        })}
      </span>
    );
  });
}

export function ExplanationPanel({ steps }: ExplanationPanelProps) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-5 bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm mt-6">
      
      {/* Title */}
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-display font-bold text-lg text-slate-800">
            Hướng Dẫn Giải Chi Tiết
          </h3>
          <p className="text-xs text-slate-400">
            Các bước khảo sát sự biến thiên và lập bảng biến thiên của hàm số
          </p>
        </div>
      </div>

      {/* Steps List */}
      <div className="flex flex-col gap-6 pl-1 md:pl-2 relative border-l border-indigo-100/60 ml-4 md:ml-5 pt-2">
        {steps.map((step, idx) => {
          return (
            <div key={idx} className="relative pl-6 pb-2 last:pb-0">
              
              {/* Bullet Node */}
              <div className="absolute -left-[31px] top-1 w-[13px] h-[13px] rounded-full bg-white border-3 border-indigo-500 shadow-sm z-10" />
              
              <div className="flex flex-col gap-2">
                {/* Step Title */}
                <h4 className="font-display font-bold text-slate-800 text-sm md:text-base flex items-center gap-2">
                  <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                    Bước {idx + 1}
                  </span>
                  {step.title}
                </h4>
                
                {/* Step Content */}
                <div className="text-slate-600 text-sm pl-1 pr-2 md:pr-4">
                  {renderRichText(step.content)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
