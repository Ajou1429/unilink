// POST /problem-bank-upload
// multipart/form-data: file(PDF), subjectId
// 원본 Ajou1429/problembank의 backend/src/parser.js + prompts.js를 그대로 포팅.
// 25페이지 넘는 PDF는 청크로 쪼개 각각 Gemini에 보낸 뒤 라벨을 합쳐 dedup한다.

import { readLimitedBody, RequestError } from "../_shared/requestLimits.ts";
import { MAX_PDF_BYTES, MAX_LABELS, validatePdf, validatePageCount, flattenLabels } from "../_shared/pdfLimits.ts";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
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

async function extractChunk(base64: string, apiKey: string, signal: AbortSignal): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        generationConfig: { maxOutputTokens: 8192, responseMimeType: "application/json" },
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

  const data = JSON.parse(new TextDecoder().decode(await readLimitedBody(res, 1024 * 1024, signal)));
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  const clean = text.replace(/```json|```/g, "").trim();
  return flattenLabels(JSON.parse(clean));
}

async function extractProblemsFromPDF(bytes: Uint8Array, apiKey: string, signal: AbortSignal): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const pageCount = doc.getPageCount();
  validatePageCount(pageCount);

  if (pageCount <= CHUNK_PAGES) {
    return mergeDedup([await extractChunk(base64Encode(bytes), apiKey, signal)]);
  }

  const chunkResults: string[][] = [];
  for (let start = 0; start < pageCount; start += CHUNK_PAGES) {
    signal.throwIfAborted();
    const end = Math.min(start + CHUNK_PAGES, pageCount);
    const chunkDoc = await PDFDocument.create();
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    const pages = await chunkDoc.copyPages(doc, indices);
    pages.forEach((p) => chunkDoc.addPage(p));
    const chunkBytes = await chunkDoc.save();
    chunkResults.push(await extractChunk(base64Encode(chunkBytes), apiKey, signal));
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

  const admin = getAdminClient();
  const { data: jobId, error: quotaError } = await admin.rpc("reserve_problem_bank_upload", { p_user_id: user.id });
  if (quotaError) return jsonResponse({ error: "업로드 사용량을 확인할 수 없습니다." }, { status: 503 });
  if (!jobId) return jsonResponse({ error: "분석이 진행 중이거나 24시간 업로드 한도를 초과했습니다." }, { status: 429, headers: { "Retry-After": "300" } });

  try {
    const signal = AbortSignal.timeout(120_000);
    if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      throw new RequestError("multipart/form-data 요청이 필요합니다.");
    }
    const raw = await readLimitedBody(req, MAX_PDF_BYTES + 65_536, signal);
    const formData = await new Response(raw, { headers: { "Content-Type": req.headers.get("content-type")! } }).formData();
    const subjectId = String(formData.get("subjectId") ?? "");
    const file = formData.get("file");
    if (!/^[0-9a-f-]{36}$/i.test(subjectId) || !(file instanceof File)) {
      throw new RequestError("과목과 PDF 파일이 필요합니다.");
    }
    const { data: subject, error: subjectError } = await admin.from("problem_bank_subjects")
      .select("id").eq("id", subjectId).eq("user_id", user.id).maybeSingle();
    if (subjectError || !subject) throw new RequestError("과목을 찾을 수 없습니다.", 404);
    const bytes = new Uint8Array(await file.arrayBuffer());
    validatePdf(bytes, file.type);
    const labels = await extractProblemsFromPDF(bytes, apiKey, signal);
    if (labels.length > MAX_LABELS) throw new RequestError("분석된 문제가 너무 많습니다.", 502);

    const { data: existingRows, error: existingError } = await admin
      .from("problem_bank_problems")
      .select("label")
      .eq("subject_id", subjectId).eq("user_id", user.id);
    if (existingError) throw existingError;
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
      : { data: [], error: null };
    if (inserted.error) throw inserted.error;

    return jsonResponse(
      {
        added: inserted.data ?? [],
        addedCount: (inserted.data ?? []).length,
        extractedCount: labels.length,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("problem-bank-upload failed", { type: error instanceof Error ? error.name : "unknown" });
    if (error instanceof RequestError) return jsonResponse({ error: error.message }, { status: error.status });
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
  } finally {
    const { error } = await admin.from("problem_bank_upload_jobs").update({ finished: true }).eq("id", jobId).eq("user_id", user.id);
    if (error) console.error("Failed to release upload lease");
  }
});
