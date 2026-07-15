import { Sidebar, MobileSidebar } from "@/components/layout/Sidebar";
import { NotificationBridge } from "@/components/notifications/NotificationBridge";
import { Suspense } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>
      <MobileSidebar />
      <NotificationBridge />
      <main className="lg:pl-60 pb-16 lg:pb-0 min-h-screen">
        {children}
      </main>
    </div>
  );
}
