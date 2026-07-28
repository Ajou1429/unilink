// POST /problem-bank-upload
// multipart/form-data: file(PDF), subjectId
// 원본 Ajou1429/problembank의 backend/src/parser.js + prompts.js를 그대로 포팅.
// 25페이지 넘는 PDF는 청크로 쪼개 각각 Gemini에 보낸 뒤 라벨을 합쳐 dedup한다.

import { PDFDocument } from "npm:pdf-lib@^1.17.1";
import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";

const GEMINI_MODEL = "gemini-flash-latest";
const CHUNK_PAGES = 25;

const EXTRACT_PROMPT = `이 PDF는 문제 세트입니다. 포함된 모든 개별 문제와 소문항을 추출하세요.
반드시 JSON 배열만 출력하고, 설명·마크다운 코드펜스는 절대 넣지 마세요.
각 원소 형식: {"number": "2.27", "parts": ["a", "b"]}
- 소문항이 없으면 "parts": []
- 문제 번호가 안 보이면 "Q1","Q2"... 순서대로 자체 부여
- 원본 번호를 정확히 보존 (예: 3.37, 3.49)
- 존재하지 않는 문제를 지어내지 마세요.`;

interface ExtractedItem {
  number?: string;
  parts?: string[];
}

function flatten(items: ExtractedItem[] | null | undefined): string[] {
  const out: string[] = [];
  (items ?? []).forEach((it) => {
    const num = String(it.number ?? "").trim();
    if (!num) return;
    if (Array.isArray(it.parts) && it.parts.length) {
      it.parts.forEach((p) => out.push(`${num}(${String(p).trim()})`));
    } else {
      out.push(num);
    }
  });
  return out;
}

function mergeDedup(lists: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const label of list) {
      if (!seen.has(label)) {
        seen.add(label);
        merged.push(label);
      }
    }
  }
  return merged;
}

async function extractChunk(base64: string, apiKey: string): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: EXTRACT_PROMPT },
              { inlineData: { mimeType: "application/pdf", data: base64 } },
            ],
          },
        ],
      }),
    },
  );

  if (!res.ok) {
    const errorText = await res.text();
    const error = new Error(`Gemini API 오류 (${res.status}): ${errorText}`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }

  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  const clean = text.replace(/```json|```/g, "").trim();
  return flatten(JSON.parse(clean));
}

async function extractProblemsFromPDF(bytes: Uint8Array, apiKey: string): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const pageCount = doc.getPageCount();

  if (pageCount <= CHUNK_PAGES) {
    return mergeDedup([await extractChunk(base64Encode(bytes), apiKey)]);
  }

  const chunkResults: string[][] = [];
  for (let start = 0; start < pageCount; start += CHUNK_PAGES) {
    const end = Math.min(start + CHUNK_PAGES, pageCount);
    const chunkDoc = await PDFDocument.create();
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    const pages = await chunkDoc.copyPages(doc, indices);
    pages.forEach((p) => chunkDoc.addPage(p));
    const chunkBytes = await chunkDoc.save();
    chunkResults.push(await extractChunk(base64Encode(chunkBytes), apiKey));
  }
  return mergeDedup(chunkResults);
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, { status: 405 });
  }

  const user = await getUserFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "인증이 필요합니다." }, { status: 401 });

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "GEMINI_API_KEY secret이 설정되지 않았습니다." }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const subjectId = String(formData.get("subjectId") ?? "");
  const file = formData.get("file");
  if (!subjectId) return jsonResponse({ error: "subjectId가 필요합니다." }, { status: 400 });
  if (!(file instanceof File)) {
    return jsonResponse({ error: "PDF 파일이 필요해요." }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: subject, error: subjectError } = await admin
    .from("problem_bank_subjects")
    .select("id")
    .eq("id", subjectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (subjectError || !subject) {
    return jsonResponse({ error: "과목을 찾을 수 없어요." }, { status: 404 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const labels = await extractProblemsFromPDF(bytes, apiKey);

    const { data: existingRows } = await admin
      .from("problem_bank_problems")
      .select("label")
      .eq("subject_id", subjectId);
    const existing = new Set((existingRows ?? []).map((r: { label: string }) => r.label));
    const freshLabels = labels.filter((l) => !existing.has(l));

    const inserted = freshLabels.length
      ? await admin
          .from("problem_bank_problems")
          .insert(
            freshLabels.map((label) => ({
              subject_id: subjectId,
              user_id: user.id,
              label,
              source_file: file.name,
            })),
          )
          .select()
      : { data: [] };

    return jsonResponse(
      {
        added: inserted.data ?? [],
        addedCount: (inserted.data ?? []).length,
        extractedCount: labels.length,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("problem-bank-upload error", error);
    const status = (error as { status?: number })?.status;
    if (status === 401 || status === 400) {
      return jsonResponse(
        { error: "Gemini API 키가 올바르지 않아요. GEMINI_API_KEY 시크릿을 확인해 주세요." },
        { status: 500 },
      );
    }
    if (status === 429) {
      return jsonResponse(
        { error: "Gemini 무료 요청 한도를 넘었어요. 잠시 후 다시 시도해 주세요." },
        { status: 500 },
      );
    }
    if (error instanceof SyntaxError) {
      return jsonResponse(
        { error: "Gemini가 응답한 문제 목록을 해석하지 못했어요. 다시 시도해 보세요." },
        { status: 500 },
      );
    }
    return jsonResponse(
      { error: "PDF에서 문제를 읽지 못했어요. 다른 파일로 다시 시도해 주세요." },
      { status: 500 },
    );
  }
});
