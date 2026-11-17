import type { ReactNode } from "react";
import type { requestDisplay } from "@/lib/chat-request-display";

export function ChatRequestDetails({ details, children }: {
  details: ReturnType<typeof requestDisplay>; children?: ReactNode;
}) {
  return <>
    {details.title && <h3 className="break-words text-xl font-bold leading-snug sm:text-2xl">{details.title}</h3>}
    {details.content.length > 0 && <ul aria-label="내용" className="list-disc space-y-1.5 whitespace-pre-wrap break-words border-t pl-5 pt-3 text-sm leading-relaxed">
      {details.content.map((line, i) => <li key={i}>{line}</li>)}
    </ul>}
    {children}
    {details.dates.length > 0 && <footer aria-label="일자" className="space-y-1 border-t pt-3 text-sm font-medium text-muted-foreground">
      {details.dates.map((line, i) => <p key={i}>{line}</p>)}
    </footer>}
  </>;
}
