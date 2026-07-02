/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';

interface MathLaTeXProps {
  math: string;
  block?: boolean;
  className?: string;
}

export function MathLaTeX({ math, block = false, className = '' }: MathLaTeXProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const renderMath = () => {
      if (containerRef.current && (window as any).katex) {
        try {
          // Clean up backslashes and helper formatting if needed
          let formattedMath = math;
          
          // Render using CDN KaTeX
          (window as any).katex.render(formattedMath, containerRef.current, {
            displayMode: block,
            throwOnError: false,
            trust: true,
          });
        } catch (err) {
          containerRef.current.textContent = math;
        }
      } else if (containerRef.current) {
        containerRef.current.textContent = math;
      }
    };

    renderMath();

    // In case KaTeX is loading asynchronously
    if (!(window as any).katex) {
      const interval = setInterval(() => {
        if ((window as any).katex) {
          renderMath();
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [math, block]);

  return (
    <span 
      ref={containerRef} 
      className={`inline-block ${block ? 'block text-center w-full my-1' : ''} ${className}`} 
    />
  );
}
