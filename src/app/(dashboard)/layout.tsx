import { Sidebar, MobileSidebar } from "@/components/layout/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <MobileSidebar />
      <main className="lg:pl-60 pb-16 lg:pb-0 min-h-screen">
        {children}
      </main>
    </div>
  );
}
