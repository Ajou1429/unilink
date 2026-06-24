import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic();

export interface AnalyzeRequest {
  courseName: string;
  week: number;
  slideText: string;
  highlightedText: string;
  extraNotes: string;
}

export interface AnalyzeResponse {
  progressSummary: string;
  conceptSummary: string;
  comprehensionScore: number;
  comprehensionNotes: string;
  teacherEmphasis: string;
  noteSummary: string;
  studyPlanSuggestion: string;
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  let body: AnalyzeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { courseName, week, slideText, highlightedText, extraNotes } = body;

  const prompt = `당신은 대학생의 강의 필기를 분석하는 AI 학습 도우미입니다.
아래 수업 데이터를 분석하여 JSON 형식으로 5가지 정리본을 생성해주세요.

## 수업 정보
- 과목: ${courseName}
- 주차: ${week}주차

## 슬라이드 텍스트
${slideText || "(슬라이드 텍스트 없음)"}

## 형광펜 강조 내용 (교수 강조)
${highlightedText || "(강조 표시 없음)"}

## 추가 필기 메모
${extraNotes || "(추가 필기 없음)"}

---

다음 JSON 형식으로 응답하세요. 다른 텍스트 없이 JSON만 출력하세요:

{
  "progressSummary": "해당 주차 강의 핵심 내용 요약 (마크다운 형식, 200-400자)",
  "conceptSummary": "슬라이드에 없는 보충 개념·배경 설명 (마크다운 형식, 150-300자)",
  "comprehensionScore": 0에서 100 사이의 정수 (필기 충실도·내용 이해도 기반),
  "comprehensionNotes": "이해도 분석: 잘 정리된 부분, 보완이 필요한 구간, 오개념 가능성 (100-200자)",
  "teacherEmphasis": "형광펜 강조 및 반복 키워드 기반 교수 강조 내용 정리 (불릿 형식)",
  "noteSummary": "추가 여백 필기 메모 구조화 정리 (없으면 빈 문자열)",
  "studyPlanSuggestion": "다음 복습 권장 계획: 우선순위 항목과 예상 소요 시간 (불릿 형식)"
}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON 파싱 실패");

    const result: AnalyzeResponse = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[AI analyze]", err);
    return NextResponse.json({ error: "AI 분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
