import { Suspense } from "react";
import { NotificationBridge } from "@/components/notifications/NotificationBridge";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/SidebarContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div data-app-shell className="flex min-h-[calc(100dvh-var(--app-top,0px))] bg-slate-50">
        <NotificationBridge />
        <Suspense fallback={null}>
          <Sidebar />
        </Suspense>
        {/* 목록을 접으면 본문이 그만큼 넓어진다 */}
        <main className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
