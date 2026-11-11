"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SPEC_CATEGORY_LABELS, type SpecCategory, type SpecRecord } from "@/lib/record-storage";

const CATEGORIES = Object.keys(SPEC_CATEGORY_LABELS) as SpecCategory[];

const TITLE_LABEL: Record<SpecCategory, string> = {
  certificate: "자격증명",
  language: "자격증명",
  competition: "공모전명",
  other: "제목",
};

type Draft = Omit<SpecRecord, "id" | "createdAt" | "updatedAt">;

export function emptySpecDraft(category: SpecCategory = "certificate"): Draft {
  return { category, title: "", acquiredAt: "", expiresAt: "", lifetime: false, issuer: "", score: "", award: "", content: "" };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function SpecForm({ initial, editing, onSubmit }: { initial: Draft; editing: boolean; onSubmit: (draft: Draft) => void }) {
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const { category } = draft;
  const datedSpec = category === "certificate" || category === "language";

  return (
    <div className="space-y-4 pt-1">
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="스펙 종류">
        {CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={category === item}
            onClick={() => set({ category: item })}
            className={`rounded-md py-1.5 text-sm font-medium ${category === item ? "bg-white shadow-sm" : "text-muted-foreground"}`}
          >
            {SPEC_CATEGORY_LABELS[item]}
          </button>
        ))}
      </div>

      <Field label={TITLE_LABEL[category]}>
        <Input autoFocus aria-label={TITLE_LABEL[category]} value={draft.title} onChange={(event) => set({ title: event.target.value })} />
      </Field>

      {datedSpec && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="취득연월">
            <Input type="month" aria-label="취득연월" value={draft.acquiredAt ?? ""} onChange={(event) => set({ acquiredAt: event.target.value })} />
          </Field>
          <Field label="만기연월">
            <Input type="month" aria-label="만기연월" value={draft.expiresAt ?? ""} disabled={draft.lifetime} onChange={(event) => set({ expiresAt: event.target.value })} />
            {category === "certificate" && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={Boolean(draft.lifetime)} onChange={(event) => set({ lifetime: event.target.checked, expiresAt: event.target.checked ? "" : draft.expiresAt })} />
                평생 자격증
              </label>
            )}
          </Field>
        </div>
      )}

      {category === "certificate" && (
        <Field label="발급기관"><Input aria-label="발급기관" value={draft.issuer ?? ""} onChange={(event) => set({ issuer: event.target.value })} /></Field>
      )}
      {category === "language" && (
        <Field label="점수"><Input aria-label="점수" value={draft.score ?? ""} onChange={(event) => set({ score: event.target.value })} /></Field>
      )}
      {category === "competition" && (
        <>
          <Field label="주최기관"><Input aria-label="주최기관" value={draft.issuer ?? ""} onChange={(event) => set({ issuer: event.target.value })} /></Field>
          <Field label="수상 이력">
            <Textarea rows={2} aria-label="수상 이력" placeholder="예: 대상 · 1등 · 상금 300만원" value={draft.award ?? ""} onChange={(event) => set({ award: event.target.value })} />
          </Field>
        </>
      )}
      {category === "other" && (
        <Field label="내용"><Textarea rows={4} aria-label="내용" value={draft.content ?? ""} onChange={(event) => set({ content: event.target.value })} /></Field>
      )}

      <Button className="w-full" disabled={!draft.title.trim()} onClick={() => onSubmit({ ...draft, title: draft.title.trim() })}>
        {editing ? "수정" : "추가"}
      </Button>
    </div>
  );
}

export function SpecDialog({ open, onOpenChange, initial, editing, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Draft;
  editing: boolean;
  onSubmit: (draft: Draft) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "스펙 수정" : "스펙 추가"}</DialogTitle></DialogHeader>
        {open && <SpecForm initial={initial} editing={editing} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  );
}
