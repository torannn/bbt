/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { BookOpen, History, PlusCircle, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface SidebarProps {
  history: string[];
  onSelectFunction: (func: string) => void;
  onClearHistory: () => void;
  activeFunction: string;
  role?: 'student' | 'teacher';
}

interface TemplateGroup {
  category: string;
  items: { label: string; formula: string; desc: string }[];
}

const TEMPLATE_FUNCTIONS: TemplateGroup[] = [
  {
    category: "Hàm đa thức (Polynomial)",
    items: [
      { label: "Bậc 3 (có cực trị)", formula: "x^3 - 3*x + 2", desc: "Hàm bậc ba có 2 cực trị đối xứng" },
      { label: "Bậc 3 (đồng biến)", formula: "x^3 + x - 1", desc: "Hàm bậc ba luôn đồng biến trên R" },
      { label: "Bậc 4 trùng phương", formula: "x^4 - 2*x^2 - 1", desc: "Hàm bậc bốn trùng phương có 3 cực trị" },
      { label: "Bậc 4 (1 cực trị)", formula: "-x^4 - x^2 + 3", desc: "Hàm bậc bốn trùng phương có 1 cực đại" },
    ]
  },
  {
    category: "Hàm phân thức (Rational)",
    items: [
      { label: "Nhất biến (bậc 1 / bậc 1)", formula: "(2*x - 1)/(x + 1)", desc: "Hàm phân thức có tiệm cận đứng x = -1" },
      { label: "Nhất biến (nghịch biến)", formula: "(x + 2)/(2*x - 1)", desc: "Hàm nhất biến nghịch biến trên từng khoảng" },
    ]
  },
  {
    category: "Hàm căn thức & Log & Mũ",
    items: [
      { label: "Hàm chứa căn thức", formula: "sqrt(x^2 - 1)", desc: "Tập xác định gồm 2 khoảng vô hạn" },
      { label: "Hàm số chứa Logarit", formula: "x * ln(x)", desc: "Hàm số chỉ xác định với x > 0" },
      { label: "Hàm số chứa mũ e", formula: "e^x - x", desc: "Hàm mũ có 1 điểm cực tiểu" },
    ]
  }
];

export function Sidebar({ history, onSelectFunction, onClearHistory, activeFunction, role }: SidebarProps) {
  const [showTemplates, setShowTemplates] = useState<boolean>(false);

  return (
    <aside className="w-full lg:w-80 flex flex-col gap-6 bg-slate-50 lg:border-r border-slate-200 p-4 lg:p-6 no-print">
      
      {/* SECTION 1: QUICK TEMPLATES */}
      {role !== 'student' && (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center justify-between text-left w-full hover:bg-slate-100 p-1.5 rounded-lg transition-colors group"
            title={showTemplates ? "Ẩn danh sách hàm số mẫu chuẩn" : "Hiện danh sách hàm số mẫu chuẩn"}
          >
            <h2 className="text-xs font-bold tracking-wider text-slate-400 uppercase flex items-center gap-2 group-hover:text-slate-655">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              Hàm Số Mẫu Chuẩn (12)
            </h2>
            {showTemplates ? (
              <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
            )}
          </button>
          
          {showTemplates && (
            <div className="flex flex-col gap-5 mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
              {TEMPLATE_FUNCTIONS.map((group, gIdx) => (
                <div key={gIdx} className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-500 bg-slate-200/50 px-2 py-0.5 rounded-md w-fit">
                    {group.category}
                  </span>
                  <div className="grid grid-cols-1 gap-1 pl-1">
                    {group.items.map((item, idx) => {
                      const isActive = activeFunction === item.formula;
                      return (
                        <button
                          key={idx}
                          onClick={() => onSelectFunction(item.formula)}
                          className={`text-left px-3 py-2 rounded-lg transition-all text-xs flex flex-col gap-0.5 border ${
                            isActive
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-medium shadow-sm'
                              : 'bg-white border-slate-100 text-slate-700 hover:bg-slate-100 hover:border-slate-200'
                          }`}
                        >
                          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <PlusCircle className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                            {item.label}
                          </span>
                          <code className="text-[10px] text-slate-500 font-mono mt-0.5 px-1 py-0.5 bg-slate-50 rounded">
                            {item.formula}
                          </code>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: HISTORY */}
      <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 mt-2 flex-grow">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold tracking-wider text-slate-400 uppercase flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            Lịch Sử Phân Tích
          </h2>
          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              title="Xóa toàn bộ lịch sử"
              className="p-1 rounded text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-white/40">
            Chưa có hàm số nào được phân tích. Hãy nhập một hàm số để bắt đầu!
          </div>
        ) : (
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
            {history.map((func, idx) => {
              const isActive = activeFunction === func;
              return (
                <button
                  key={idx}
                  onClick={() => onSelectFunction(func)}
                  className={`text-left px-3 py-2 rounded-lg transition-all text-xs font-mono truncate border ${
                    isActive
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold'
                      : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-100 hover:border-slate-200'
                  }`}
                >
                  {func}
                </button>
              );
            })}
          </div>
        )}
      </div>

    </aside>
  );
}
