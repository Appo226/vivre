"use client";

import { AdminGuard } from "@/components/AdminGuard";
import { AdminSidebar } from "@/components/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <AdminGuard>
      <AdminSidebar />
      <div className="md:pl-64">{children}</div>
    </AdminGuard>
  );
}
