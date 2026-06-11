/**
 * voiceGemini.js — Gemini API 기반 음성 입력 파싱 (JARVIS 모드)
 *
 * 사용자의 자연어 음성 입력을 Gemini에 보내 구조화된 작업 데이터로 변환합니다.
 * 네트워크 실패 시 규칙 기반 파서(voiceNlp.js)로 자동 폴백합니다.
 */

const GEMINI_API_KEY = import.meta?.env?.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `당신은 "시그마 태스크 매니저"의 AI 비서입니다. 사용자가 음성으로 말한 작업 내용을 분석하여 구조화된 JSON으로 변환해야 합니다.

현재 날짜/시간: {{NOW}}

다음 필드를 추출하세요:

1. **title** (string, 필수): 작업의 핵심 내용만 간결하게. 마감/중요도/카테고리 키워드는 제거.
   예: "내일까지 급한 보고서 작성해야 해" → "보고서 작성"

2. **deadline** (string|null): ISO 8601 형식. 현재 시간 기준으로 계산.
   "내일" → 내일 09:00, "모레" → 모레 09:00, "이번 주 금요일" → 해당 날짜 09:00
   언급이 없으면 null.

3. **importance** (number, 1-5): 
   긴급/급한/중요/꼭/반드시 → 5
   중요한 → 4
   기본값 → 3
   천천히/나중에/여유 → 2
   시간 나면/심심할 때 → 1

4. **category** (string): 반드시 다음 중 하나:
   "회의" — 회의, 미팅, 스탠드업
   "개발" — 코딩, 코드, 버그, 배포, 리뷰, 테스트
   "디자인" — 디자인, 시안, 목업, UI/UX
   "문서" — 보고서, 기획서, 제안서, 문서, PPT, 슬라이드
   "개인" — 개인적인 일, 장보기, 운동, 병원
   "인사" — 면접, 채용, 평가, 1on1
   "업무" — 위에 해당하지 않는 일반 업무 (기본값)

5. **requiredEnergy** (string): "LOW" | "MEDIUM" | "HIGH"
   가벼운/쉬운/단순한 → LOW
   기본값 → MEDIUM
   집중/복잡한/어려운 → HIGH

6. **estimatedMinutes** (number): 소요 예상 시간(분).
   "1시간" → 60, "30분" → 30, "2시간 반" → 150
   언급이 없으면 작업 특성에 맞게 추정 (회의→60, 코드리뷰→30, 보고서→60, 이메일→15 등)

7. **ttsResponse** (string): 자비스처럼 자연스러운 한국어 응답.
   예: "내일까지 보고서 작성, 중요도 높음으로 기록할게요."

반드시 유효한 JSON만 출력하세요. 다른 텍스트나 마크다운은 포함하지 마세요.`;

/**
 * Gemini API로 음성 입력을 파싱합니다.
 * @param {string} text - STT가 인식한 텍스트
 * @returns {Promise<object|null>} 파싱 결과 또는 실패 시 null
 */
export async function parseWithGemini(text) {
  if (!GEMINI_API_KEY || !text?.trim()) return null;

  const now = new Date();
  const nowStr = now.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'long', hour: '2-digit', minute: '2-digit',
  });

  const prompt = SYSTEM_PROMPT.replace('{{NOW}}', nowStr);

  try {
    const resp = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: prompt }] },
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!resp.ok) {
      console.warn('[voiceGemini] API error:', resp.status);
      return null;
    }

    const data = await resp.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // 유효성 검증
    if (!parsed.title || typeof parsed.title !== 'string') return null;

    return {
      title: parsed.title.trim(),
      deadline: parsed.deadline || undefined,
      importance: Math.max(1, Math.min(5, parsed.importance ?? 3)),
      category: parsed.category || '업무',
      requiredEnergy: ['LOW', 'MEDIUM', 'HIGH'].includes(parsed.requiredEnergy) ? parsed.requiredEnergy : 'MEDIUM',
      estimatedMinutes: parsed.estimatedMinutes ?? 30,
      ttsResponse: parsed.ttsResponse || null,
      parsed: {
        source: 'gemini',
        ...(parsed.deadline ? { deadline: new Date(parsed.deadline).toLocaleDateString('ko-KR') } : {}),
      },
    };
  } catch (err) {
    console.warn('[voiceGemini] parse failed, falling back to rule-based:', err);
    return null;
  }
}

/** Gemini API 사용 가능 여부 */
export function isGeminiAvailable() {
  return Boolean(GEMINI_API_KEY);
}
