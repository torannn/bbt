/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { analyzeFunctionCAS } from './src/lib/cas';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API endpoint for math function analysis
app.post('/api/analyze-function', async (req, res) => {
  try {
    const { functionStr } = req.body;
    if (!functionStr || typeof functionStr !== 'string') {
      res.status(400).json({ error: 'Vui lòng cung cấp công thức hàm số hợp lệ.' });
      return;
    }

    // Try analyzing completely offline/deterministically using the local CAS engine first
    try {
      console.log(`[CAS Engine] Đang phân tích tự động: "${functionStr}"`);
      const casResult = analyzeFunctionCAS(functionStr);
      res.json(casResult);
      return;
    } catch (casError) {
      console.warn('[CAS Engine] Không thể phân tích tự động bằng math.js, đang chuyển hướng sang Gemini AI...', casError);
    }

    if (!apiKey) {
      res.status(500).json({ error: 'Thiếu cấu hình GEMINI_API_KEY trên server. Vui lòng cài đặt trong mục Settings > Secrets.' });
      return;
    }

    const systemInstruction = `Bạn là một chuyên gia Toán học trung học phổ thông Việt Nam xuất sắc và là một lập trình viên LaTeX kỳ cựu. 
Nhiệm vụ của bạn là nhận vào công thức của một hàm số toán học (có thể chứa đa thức, phân thức, căn thức, mũ, logarit, lượng giác, ví dụ: "x^3 - 3*x + 2", "(2x - 1)/(x + 1)", "ln(x)", "x * e^x") và thực hiện phân tích đầy đủ, chính xác tuyệt đối để dựng Bảng biến thiên (BBT) theo phong cách toán học chuẩn của Bộ Giáo dục và Đào tạo Việt Nam.

Bạn CẦN xuất dữ liệu dưới dạng JSON khớp hoàn hảo với schema được cung cấp.

Quy tắc toán học cực kỳ quan trọng:
1. Tập xác định (TXD): Viết dưới dạng công thức LaTeX hoàn chỉnh, ví dụ: "D = \\mathbb{R}" hoặc "D = \\mathbb{R} \\setminus \\{-1\\}" hoặc "D = (0; +\\infty)".
2. Công thức đạo hàm y': Tính toán chính xác đạo hàm và biểu diễn ở định dạng LaTeX đẹp mắt, ví dụ: "y' = 3x^2 - 3" hoặc "y' = \\frac{3}{(x+1)^2}".
3. Dòng hoành độ x (x_points):
   - Phải sắp xếp các mốc hoành độ x tăng dần từ trái sang phải: bắt đầu bằng "-\\infty" (nếu miền xác định vô hạn về phía âm) và kết thúc bằng "+\\infty" (nếu miền xác định vô hạn về phía dương).
   - Bao gồm tất cả các mốc đặc biệt: điểm biên của tập xác định (ví dụ: điểm mà hàm gián đoạn hoặc không xác định như x = -1 của hàm phân thức), và các điểm cực trị (nghiệm của y' = 0).
   - Mỗi điểm có:
     - "id": sinh ngẫu nhiên duy nhất (ví dụ: "x-0", "x-1", ...)
     - "latex": chuỗi LaTeX biểu diễn mốc đó (ví dụ: "-\\infty", "-1", "0", "1", "+\\infty", "\\sqrt{2}").
     - "type": "infinity" (cho vô cực), "critical" (cho cực trị hoặc điểm thường), "discontinuity" (cho điểm gián đoạn, tiệm cận đứng, hàm số không xác định).
     - "value": giá trị số thực xấp xỉ tương ứng (để sắp xếp).
4. Dòng đạo hàm y' (y_prime):
   - Mảng "points": Chứa ký hiệu tại mỗi mốc x. Các giá trị có thể là "0" (nghiệm của y'=0), "d" (không xác định, vẽ 2 vạch song song "||"), hoặc "" (không ghi gì, ví dụ ở vô cực). Độ dài bằng x_points.
   - Mảng "intervals": Chứa dấu của y' trên các khoảng giữa các mốc x. Giá trị có thể là "+" (đạo hàm dương), "-" (đạo hàm âm), hoặc "h" (khoảng không xác định / bị gạch chéo). Độ dài bằng x_points.length - 1.
5. Dòng giá trị y (y_row):
   - Mảng "points": Chứa thông tin biểu diễn y tại mỗi mốc x. Mỗi phần tử có cấu trúc:
     - Nếu là điểm thường ("type": "single"): có "latex" (giá trị y, ví dụ: "4", "0", "-\\infty", "+\\infty") và "position" ("top" nếu là cực đại hoặc giới hạn dương vô cực, "bottom" nếu là cực tiểu hoặc giới hạn âm vô cực, "middle" nếu nằm giữa).
     - Nếu là điểm gián đoạn song song hai vạch ("type": "discontinuity"): có "latexLeft" (giới hạn bên trái, ví dụ "-\\infty"), "positionLeft" ("top"|"middle"|"bottom"), "latexRight" (giới hạn bên phải, ví dụ "+\\infty"), và "positionRight" ("top"|"middle"|"bottom").
6. LaTeX Code (latex_code): 
   - Tạo mã LaTeX hoàn chỉnh và tự chạy được sử dụng gói "tkz-tab" để vẽ BBT của hàm số này.
   - Sử dụng \\tkzTabInit, \\tkzTabLine, \\tkzTabVar đúng cú pháp của tkz-tab.
   - Tính toán tự động khoảng cách cột để tránh bị tràn lề hoặc quá khít chữ: Công thức tính espcl tối ưu là espcl = max(1.5, 8.0 / so_cot) (với so_cot là số lượng điểm hoành độ x). Cấu hình ví dụ: \\tkzTabInit[lgt=2.5, espcl=...]...
   - Ví dụ hàm trùng phương hoặc phân thức: sử dụng đúng tùy chọn "d" cho hai vạch, "z" cho số 0, "+D-" cho gián đoạn ở dòng y.
7. Các bước giải thích chi tiết (explanation_steps):
   - Chứa các bước giải thích chi tiết bằng tiếng Việt: Tìm tập xác định, Tính đạo hàm y', Giải y' = 0, Xét dấu và giới hạn để học sinh hiểu được cách làm.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `Hãy phân tích hàm số sau và trả về BBT chi tiết: "${functionStr}"`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['functionStr', 'functionLatex', 'txd', 'derivative', 'x_points', 'y_prime', 'y_row', 'latex_code', 'explanation_steps'],
          properties: {
            functionStr: { type: Type.STRING },
            functionLatex: { type: Type.STRING },
            txd: { type: Type.STRING },
            derivative: { type: Type.STRING },
            x_points: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['id', 'latex', 'type'],
                properties: {
                  id: { type: Type.STRING },
                  latex: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['infinity', 'critical', 'discontinuity'] },
                  value: { type: Type.NUMBER }
                }
              }
            },
            y_prime: {
              type: Type.OBJECT,
              required: ['points', 'intervals'],
              properties: {
                points: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING } // empty, '0', or 'd'
                },
                intervals: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING } // '+', '-', or 'h'
                }
              }
            },
            y_row: {
              type: Type.OBJECT,
              required: ['points'],
              properties: {
                points: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    required: ['type'],
                    properties: {
                      type: { type: Type.STRING, enum: ['single', 'discontinuity'] },
                      latex: { type: Type.STRING },
                      position: { type: Type.STRING, enum: ['top', 'middle', 'bottom'] },
                      latexLeft: { type: Type.STRING },
                      positionLeft: { type: Type.STRING, enum: ['top', 'middle', 'bottom'] },
                      latexRight: { type: Type.STRING },
                      positionRight: { type: Type.STRING, enum: ['top', 'middle', 'bottom'] }
                    }
                  }
                }
              }
            },
            latex_code: { type: Type.STRING },
            explanation_steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['title', 'content'],
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error('Không nhận được phản hồi phân tích từ mô hình AI.');
    }

    const data = JSON.parse(resultText.trim());
    res.json(data);
  } catch (error: any) {
    console.error('Lỗi khi phân tích hàm số:', error);
    res.status(500).json({ error: error?.message || 'Có lỗi xảy ra trong quá trình phân tích.' });
  }
});

// Setup Vite or static file serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Trình Tạo Bảng Biến Thiên đang chạy tại http://localhost:${PORT}`);
  });
}

startServer();
