import { CoachingError, type CoachingRequest, type Proposal } from "./contract.ts";
import { modelContext } from "./context.ts";
import type { CoachingContext } from "./contract.ts";

const requestKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function coachingRequestKey(raw: unknown, headerValue: string | null): string {
  const bodyValue = object(raw) ? raw.request_key : undefined;
  if (bodyValue !== undefined && typeof bodyValue !== "string") throw new CoachingError("Invalid coaching request key");
  const bodyKey = typeof bodyValue === "string" ? bodyValue.trim() : "";
  const headerKey = headerValue?.trim() ?? "";
  if (bodyKey && headerKey && bodyKey !== headerKey) throw new CoachingError("Conflicting coaching request keys", 409);
  const key = bodyKey || headerKey || crypto.randomUUID();
  if (!requestKeyPattern.test(key)) throw new CoachingError("Invalid coaching request key");
  return key;
}

export async function coachingRequestHash(request: CoachingRequest): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(request)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function coachingRequestPayload(request: CoachingRequest, requestHash: string) {
  return { schema_version: 1, request_hash: requestHash, request };
}

export function coachingContextSnapshot(context: CoachingContext) {
  return { schema_version: 1, context: modelContext(context) };
}

export function coachingOutputPayload(proposal: Proposal) {
  return { schema_version: 2, proposal };
}

export function proposalFromStoredOutput(value: unknown): Proposal | null {
  if (!object(value) || value.schema_version !== 2 || !object(value.proposal)) return null;
  return value.proposal as unknown as Proposal;
}
