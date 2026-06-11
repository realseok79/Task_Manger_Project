/**
 * voiceNlp.js — 한국어 자연어 음성 입력 파서 (JARVIS 모드)
 *
 * 규칙 기반으로 음성 텍스트에서 작업 메타데이터를 추출합니다.
 * 외부 API 없이 프론트엔드에서 즉시 동작합니다.
 *
 * 추출 대상: 제목, 마감일, 중요도, 카테고리, 에너지 레벨, 소요시간
 */

// ───── 카테고리 키워드 매핑 ─────
const CATEGORY_KEYWORDS = {
  회의: ['회의', '미팅', '스탠드업', '데일리', '주간회의', '월간회의', '킥오프', '브리핑'],
  개발: ['개발', '코딩', '코드', '프로그래밍', '디버깅', '버그', '리팩토링', '배포', 'PR', '풀리퀘', '커밋', '테스트 코드', '리뷰'],
  디자인: ['디자인', '시안', '목업', '프로토타입', '피그마', 'UI', 'UX', '와이어프레임', '레이아웃'],
  문서: ['문서', '보고서', '기획서', '제안서', '명세서', '정리', '작성', '초안', '리포트', '발표 자료', '슬라이드', 'PPT'],
  개인: ['개인', '장보기', '운동', '병원', '약속', '청소', '세탁', '요리', '산책', '쇼핑'],
  인사: ['인사', '면접', '채용', '온보딩', '평가', '피드백', '1on1', '원온원'],
  업무: ['업무', '일', '태스크', '작업'],
};

// ───── 중요도 키워드 ─────
const IMPORTANCE_HIGH = ['급해', '급한', '급하게', '긴급', '중요', '중요한', '중요하게', '꼭', '반드시', '필수', '시급', '시급한', '최우선', '우선'];
const IMPORTANCE_LOW = ['천천히', '나중에', '여유', '가벼운', '가볍게', '간단한', '간단히', '심심할 때', '시간 나면', '언제든'];

// ───── 에너지 키워드 ─────
const ENERGY_HIGH = ['집중', '빡센', '빡세게', '힘든', '어려운', '고난이도', '복잡한', '까다로운'];
const ENERGY_LOW = ['가벼운', '가볍게', '쉬운', '간단한', '간단히', '심플한', '루틴', '단순한'];

// ───── 마감일 파싱 ─────

/** 오늘 기준으로 N일 후 날짜의 ISO 문자열 반환 (09:00 KST) */
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/** 오늘 자정 직전 */
function todayEnd() {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

/** "이번 주 X요일" / "다음 주 X요일" 파싱 */
const DAY_NAMES = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 0 };

function getWeekday(dayName, nextWeek = false) {
  const target = DAY_NAMES[dayName];
  if (target === undefined) return null;
  const d = new Date();
  const current = d.getDay(); // 0=Sun
  let diff = target - current;
  if (diff <= 0) diff += 7; // 이미 지났으면 다음 주
  if (nextWeek) diff += 7;
  d.setDate(d.getDate() + diff);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/** 텍스트에서 마감일 추출 — 매칭된 부분 문자열과 ISO 날짜 반환 */
function extractDeadline(text) {
  // "N월 N일" — 절대 날짜
  const absMatch = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (absMatch) {
    const d = new Date();
    let month = parseInt(absMatch[1], 10) - 1;
    let day = parseInt(absMatch[2], 10);
    d.setMonth(month, day);
    d.setHours(9, 0, 0, 0);
    // 이미 지난 날짜면 내년으로
    if (d < new Date()) d.setFullYear(d.getFullYear() + 1);
    return { matched: absMatch[0], iso: d.toISOString() };
  }

  // "N일 후" / "N일 뒤" / "N일 내"
  const relDayMatch = text.match(/(\d+)\s*일\s*(후|뒤|내|안)/);
  if (relDayMatch) {
    return { matched: relDayMatch[0], iso: daysFromNow(parseInt(relDayMatch[1], 10)) };
  }

  // "N시간 후" / "N시간 뒤"
  const relHourMatch = text.match(/(\d+)\s*시간\s*(후|뒤)/);
  if (relHourMatch) {
    const d = new Date();
    d.setHours(d.getHours() + parseInt(relHourMatch[1], 10));
    return { matched: relHourMatch[0], iso: d.toISOString() };
  }

  // "다음 주 X요일"
  const nextWeekMatch = text.match(/다음\s*주?\s*(월|화|수|목|금|토|일)\s*요일?/);
  if (nextWeekMatch) {
    const iso = getWeekday(nextWeekMatch[1], true);
    if (iso) return { matched: nextWeekMatch[0], iso };
  }

  // "이번 주 X요일"
  const thisWeekMatch = text.match(/이번\s*주?\s*(월|화|수|목|금|토|일)\s*요일?/);
  if (thisWeekMatch) {
    const iso = getWeekday(thisWeekMatch[1], false);
    if (iso) return { matched: thisWeekMatch[0], iso };
  }

  // "X요일까지" (단독)
  const dowMatch = text.match(/(월|화|수|목|금|토|일)\s*요일/);
  if (dowMatch) {
    const iso = getWeekday(dowMatch[1], false);
    if (iso) return { matched: dowMatch[0], iso };
  }

  // 상대 키워드
  if (/오늘/.test(text)) return { matched: '오늘', iso: todayEnd() };
  if (/내일\s*모레|모레/.test(text)) {
    const m = text.match(/내일\s*모레|모레/);
    return { matched: m[0], iso: daysFromNow(2) };
  }
  if (/내일/.test(text)) return { matched: '내일', iso: daysFromNow(1) };
  if (/글피/.test(text)) return { matched: '글피', iso: daysFromNow(3) };

  return null;
}

// ───── 소요시간 파싱 ─────
function extractDuration(text) {
  // "N시간 M분" / "N시간 반"
  const fullMatch = text.match(/(\d+)\s*시간\s*(?:(\d+)\s*분|반)?/);
  if (fullMatch) {
    // "N시간 후/뒤" 는 마감일이지 소요시간이 아님
    const after = text.slice(text.indexOf(fullMatch[0]) + fullMatch[0].length).trim();
    if (/^(후|뒤)/.test(after)) return null;

    let mins = parseInt(fullMatch[1], 10) * 60;
    if (fullMatch[2]) mins += parseInt(fullMatch[2], 10);
    else if (/반/.test(fullMatch[0])) mins += 30;
    return { matched: fullMatch[0], minutes: mins };
  }
  // "N분" (standalone)
  const minMatch = text.match(/(\d+)\s*분/);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    if (mins >= 5 && mins <= 480) return { matched: minMatch[0], minutes: mins };
  }
  return null;
}

// ───── 키워드 감지 유틸 ─────
function findKeyword(text, keywords) {
  for (const kw of keywords) {
    if (text.includes(kw)) return kw;
  }
  return null;
}

function detectCategory(text) {
  // 구체적 카테고리(회의, 개발 등)를 먼저 검사하고, "업무"는 마지막 폴백
  const ordered = ['회의', '개발', '디자인', '문서', '개인', '인사', '업무'];
  for (const cat of ordered) {
    const kw = findKeyword(text, CATEGORY_KEYWORDS[cat]);
    if (kw) return { category: cat, matched: kw };
  }
  return null;
}

function detectImportance(text) {
  const high = findKeyword(text, IMPORTANCE_HIGH);
  if (high) return { importance: 5, matched: high };
  const low = findKeyword(text, IMPORTANCE_LOW);
  if (low) return { importance: 1, matched: low };
  return null;
}

function detectEnergy(text) {
  const high = findKeyword(text, ENERGY_HIGH);
  if (high) return { energy: 'HIGH', matched: high };
  const low = findKeyword(text, ENERGY_LOW);
  if (low) return { energy: 'LOW', matched: low };
  return null;
}

// ───── 제목 정제 ─────
/** 파싱에 사용된 키워드/패턴을 제거하고 깨끗한 제목만 남긴다 */
function cleanTitle(text, removals) {
  let title = text;
  for (const r of removals) {
    if (r) title = title.replace(r, ' ');
  }
  // 한국어 어미/키워드 정리
  title = title
    .replace(/\s*(까지|전에|마감|안에|이내|해야\s*해|해야\s*돼|해줘|하기|할\s*것|좀|해야\s*하는|짜리)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // 앞뒤 불필요한 조사/접속사 제거
  title = title.replace(/^(그|그냥|좀|일단|그리고|그래서)\s+/g, '')
               .replace(/(을|를|이|가|은|는)\s*$/g, '')
               .trim();
  return title || text.trim();
}

// ───── 메인 파서 ─────
/**
 * 자연어 음성 입력에서 작업 메타데이터를 추출합니다.
 *
 * @param {string} text - STT가 인식한 텍스트
 * @returns {{
 *   title: string,
 *   deadline?: string,        // ISO 8601
 *   importance: number,       // 1-5
 *   category: string,
 *   requiredEnergy: string,   // LOW | MEDIUM | HIGH
 *   estimatedMinutes: number,
 *   parsed: { deadline?: string, importance?: string, category?: string, energy?: string, duration?: string }
 * }}
 */
export function parseVoiceInput(text) {
  if (!text || !text.trim()) {
    return {
      title: '',
      importance: 3,
      category: '업무',
      requiredEnergy: 'MEDIUM',
      estimatedMinutes: 30,
      parsed: {},
    };
  }

  const normalized = text.trim();
  const removals = [];

  // 1) 마감일
  const dl = extractDeadline(normalized);
  if (dl) removals.push(dl.matched);

  // 2) 소요시간
  const dur = extractDuration(normalized);
  if (dur) removals.push(dur.matched);

  // 3) 중요도
  const imp = detectImportance(normalized);
  if (imp) removals.push(imp.matched);

  // 4) 에너지
  const eng = detectEnergy(normalized);
  if (eng) removals.push(eng.matched);

  // 5) 카테고리
  const cat = detectCategory(normalized);
  // 카테고리 키워드는 제목에 남겨둔다 ("팀 회의 준비" → "회의"를 안 지움)
  // 단, "개인" 같은 순수 카테고리 단어는 제거
  const catOnlyWords = ['개인', '업무'];
  if (cat && catOnlyWords.includes(cat.matched)) removals.push(cat.matched);

  // 6) 제목 정제
  const title = cleanTitle(normalized, removals);

  // parsed: UI에서 "이렇게 파싱했어요" 표시용
  const parsed = {};
  if (dl) parsed.deadline = dl.matched;
  if (imp) parsed.importance = imp.matched;
  if (cat) parsed.category = cat.matched;
  if (eng) parsed.energy = eng.matched;
  if (dur) parsed.duration = dur.matched;

  return {
    title,
    deadline: dl?.iso,
    importance: imp?.importance ?? 3,
    category: cat?.category ?? '업무',
    requiredEnergy: eng?.energy ?? 'MEDIUM',
    estimatedMinutes: dur?.minutes ?? 30,
    parsed,
  };
}

/** 파싱 결과를 한국어 TTS 문장으로 변환 */
export function parsedToSpeech(result) {
  const parts = [`"${result.title}"`];
  if (result.parsed.deadline) parts.push(`마감 ${result.parsed.deadline}`);
  if (result.parsed.importance) parts.push(`중요도 ${result.parsed.importance}`);
  if (result.parsed.category) parts.push(`카테고리 ${result.parsed.category}`);
  return `기록했어요: ${parts.join(', ')}`;
}
