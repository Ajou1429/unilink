"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PdfPreviewProps {
  fileUrl: string;
  title: string;
}

interface PdfPage {
  getViewport(input: { scale: number }): { width: number; height: number };
  render(input: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): PdfRenderTask;
}

interface PdfRenderTask {
  promise: Promise<void>;
  cancel: () => void;
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}

interface PdfJsModule {
  getDocument(input: { data: ArrayBuffer }): { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
}

export function PdfPreview({ fileUrl, title }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pdf: PdfDocument | null = null;

    async function load() {
      setLoading(true);
      setError(null);
      setPageNumber(1);
      try {
        const [module, response] = await Promise.all([
          import("pdfjs-dist/build/pdf.mjs"),
          fetch(fileUrl),
        ]);
        const { getDocument, GlobalWorkerOptions } = module as PdfJsModule;
        if (!response.ok) throw new Error("PDF 파일을 불러오지 못했습니다.");
        GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const bytes = await response.arrayBuffer();
        pdf = await getDocument({ data: bytes }).promise;
        if (cancelled) {
          await pdf.destroy();
          return;
        }
        setDocument(pdf);
      } catch {
        if (!cancelled) setError("PDF 미리보기를 불러오지 못했습니다. 파일 열기 버튼으로 확인해주세요.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (pdf) void pdf.destroy();
    };
  }, [fileUrl]);

  useEffect(() => {
    if (!document || !canvasRef.current || !previewRef.current) return;
    let cancelled = false;
    const pdf = document;
    let renderTask: PdfRenderTask | null = null;

    async function render() {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current || !previewRef.current) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(280, previewRef.current.clientWidth - 32);
        const scale = Math.min(2.5, Math.max(0.5, availableWidth / baseViewport.width)) * zoom;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas를 초기화하지 못했습니다.");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (renderError) {
        if (!cancelled && !(renderError instanceof Error && renderError.name === "RenderingCancelledException")) {
          setError("PDF 페이지를 표시하지 못했습니다. 파일 열기 버튼으로 확인해주세요.");
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber, zoom]);

  const pageCount = document?.numPages ?? 0;

  return (
    <div ref={previewRef} className="overflow-auto rounded-lg border bg-muted/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" title="이전 페이지" aria-label="이전 페이지" disabled={!document || pageNumber <= 1} onClick={() => setPageNumber((value) => value - 1)}>
            <ChevronLeft />
          </Button>
          <span className="min-w-24 text-center text-sm tabular-nums">{pageCount ? `${pageNumber} / ${pageCount}` : "불러오는 중"}</span>
          <Button type="button" variant="ghost" size="icon-sm" title="다음 페이지" aria-label="다음 페이지" disabled={!document || pageNumber >= pageCount} onClick={() => setPageNumber((value) => value + 1)}>
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" title="축소" aria-label="축소" disabled={zoom <= 0.6} onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.2).toFixed(1))))}>
            <ZoomOut />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" title="확대" aria-label="확대" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, Number((value + 0.2).toFixed(1))))}>
            <ZoomIn />
          </Button>
        </div>
      </div>
      {loading && <p className="py-12 text-center text-sm text-muted-foreground">PDF를 불러오는 중입니다.</p>}
      {error && <p className="py-12 text-center text-sm text-destructive">{error}</p>}
      {!loading && !error && <canvas ref={canvasRef} aria-label={`${title} ${pageNumber}페이지`} className="mx-auto block max-w-none bg-white shadow-sm" />}
    </div>
  );
}
