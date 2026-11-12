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
      <div className="flex min-h-screen bg-slate-50">
        <NotificationBridge />
        <Suspense fallback={null}>
          <Sidebar />
        </Suspense>
        {/* 목록을 접으면 본문이 그만큼 넓어진다 */}
        <main className="min-h-screen min-w-0 flex-1">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
