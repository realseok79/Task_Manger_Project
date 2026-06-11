import { describe, it, expect } from 'vitest';
import { parseVoiceInput, parsedToSpeech } from '../voiceNlp.js';

describe('parseVoiceInput', () => {
  // ── 마감일 파싱 ──
  it('extracts "내일" deadline', () => {
    const r = parseVoiceInput('내일까지 보고서 작성');
    expect(r.deadline).toBeTruthy();
    expect(r.parsed.deadline).toBe('내일');
    expect(r.title).toContain('보고서');
  });

  it('extracts "모레" deadline', () => {
    const r = parseVoiceInput('모레 디자인 시안 검토');
    expect(r.deadline).toBeTruthy();
    expect(r.parsed.deadline).toMatch(/모레/);
  });

  it('extracts "N일 후" deadline', () => {
    const r = parseVoiceInput('3일 후까지 제안서 제출');
    expect(r.deadline).toBeTruthy();
    expect(r.parsed.deadline).toBe('3일 후');
  });

  it('extracts absolute date "6월 15일"', () => {
    const r = parseVoiceInput('6월 15일까지 프로젝트 완료');
    expect(r.deadline).toBeTruthy();
    expect(r.parsed.deadline).toBe('6월 15일');
  });

  it('returns no deadline when none mentioned', () => {
    const r = parseVoiceInput('이메일 정리');
    expect(r.deadline).toBeUndefined();
  });

  // ── 중요도 파싱 ──
  it('detects high importance from "급한"', () => {
    const r = parseVoiceInput('급한 팀 회의 준비');
    expect(r.importance).toBe(5);
  });

  it('detects high importance from "중요한"', () => {
    const r = parseVoiceInput('중요한 코드 리뷰');
    expect(r.importance).toBe(5);
  });

  it('detects low importance from "천천히"', () => {
    const r = parseVoiceInput('천천히 서류 정리');
    expect(r.importance).toBe(1);
  });

  it('defaults importance to 3', () => {
    const r = parseVoiceInput('장보기');
    expect(r.importance).toBe(3);
  });

  // ── 카테고리 파싱 ──
  it('detects "회의" category', () => {
    const r = parseVoiceInput('팀 회의 준비');
    expect(r.category).toBe('회의');
  });

  it('detects "개발" category from "코드"', () => {
    const r = parseVoiceInput('코드 리뷰 진행');
    expect(r.category).toBe('개발');
  });

  it('detects "디자인" category from "시안"', () => {
    const r = parseVoiceInput('시안 검토');
    expect(r.category).toBe('디자인');
  });

  it('detects "문서" category from "보고서"', () => {
    const r = parseVoiceInput('보고서 작성');
    expect(r.category).toBe('문서');
  });

  it('detects "개인" category from "장보기"', () => {
    const r = parseVoiceInput('장보기');
    expect(r.category).toBe('개인');
  });

  it('defaults category to "업무"', () => {
    const r = parseVoiceInput('뭔가 해야 해');
    expect(r.category).toBe('업무');
  });

  // ── 에너지 파싱 ──
  it('detects LOW energy from "가벼운"', () => {
    const r = parseVoiceInput('가벼운 이메일 정리');
    expect(r.requiredEnergy).toBe('LOW');
  });

  it('detects HIGH energy from "집중"', () => {
    const r = parseVoiceInput('집중해서 알고리즘 풀기');
    expect(r.requiredEnergy).toBe('HIGH');
  });

  it('defaults energy to MEDIUM', () => {
    const r = parseVoiceInput('미팅 준비');
    expect(r.requiredEnergy).toBe('MEDIUM');
  });

  // ── 소요시간 파싱 ──
  it('extracts "1시간" duration', () => {
    const r = parseVoiceInput('1시간짜리 코드 리뷰');
    expect(r.estimatedMinutes).toBe(60);
  });

  it('extracts "30분" duration', () => {
    const r = parseVoiceInput('30분 동안 이메일 정리');
    expect(r.estimatedMinutes).toBe(30);
  });

  it('extracts "2시간 반" duration', () => {
    const r = parseVoiceInput('2시간 반 동안 개발');
    expect(r.estimatedMinutes).toBe(150);
  });

  it('defaults duration to 30 minutes', () => {
    const r = parseVoiceInput('뭔가 해야 해');
    expect(r.estimatedMinutes).toBe(30);
  });

  // ── 제목 정제 ──
  it('removes deadline keywords from title', () => {
    const r = parseVoiceInput('내일까지 보고서 작성해야 해');
    expect(r.title).not.toContain('내일');
    expect(r.title).not.toContain('까지');
    expect(r.title).toContain('보고서');
  });

  it('removes importance keywords from title', () => {
    const r = parseVoiceInput('급한 팀 회의 준비');
    expect(r.title).not.toContain('급한');
    expect(r.title).toContain('회의');
  });

  // ── 복합 파싱 ──
  it('parses complex sentence with multiple fields', () => {
    const r = parseVoiceInput('내일까지 급한 팀 회의 준비 해야 해');
    expect(r.deadline).toBeTruthy();
    expect(r.importance).toBe(5);
    expect(r.category).toBe('회의');
    expect(r.title).toContain('회의');
  });

  // ── 빈 입력 ──
  it('handles empty input gracefully', () => {
    const r = parseVoiceInput('');
    expect(r.title).toBe('');
    expect(r.importance).toBe(3);
    expect(r.category).toBe('업무');
  });

  it('handles null input gracefully', () => {
    const r = parseVoiceInput(null);
    expect(r.title).toBe('');
  });
});

describe('parsedToSpeech', () => {
  it('generates natural TTS response', () => {
    const result = {
      title: '보고서 작성',
      parsed: { deadline: '내일', importance: '급한', category: '보고서' },
    };
    const speech = parsedToSpeech(result);
    expect(speech).toContain('보고서 작성');
    expect(speech).toContain('내일');
    expect(speech).toContain('기록했어요');
  });
});
