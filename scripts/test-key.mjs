// Gemini API 키가 실제로 동작하는지만 검사. (키 전체는 출력하지 않음)
import { GoogleGenAI } from "@google/genai";

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY 환경변수가 없습니다.");
  process.exit(1);
}
console.log(`키 접두사: ${key.slice(0, 4)}... (길이 ${key.length})`);

const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ai = new GoogleGenAI({ apiKey: key });

try {
  const r = await ai.models.generateContent({
    model,
    contents: "한 단어로만 답해: 테스트 성공이면 'OK'",
  });
  console.log(`✅ 성공 — 모델(${model}) 응답:`, r.text);
} catch (e) {
  console.error(`❌ 실패 — ${e.message}`);
}
