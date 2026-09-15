import { NotificationBridge } from "@/components/notifications/NotificationBridge";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <NotificationBridge />
      <main className="min-h-screen">
        {children}
      </main>
    </div>
  );
}
