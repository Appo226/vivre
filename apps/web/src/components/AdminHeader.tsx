"use client";

import Link from "next/link";

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
}

export function AdminHeader({ title, subtitle, backHref = "/admin" }: AdminHeaderProps): React.ReactElement {
  return (
    <header className="bg-dark text-white px-4 md:px-8 pt-safe-top pb-5 md:pt-8">
      <div className="flex items-center gap-3 pt-4 md:pt-0">
        {/* La flèche retour double la nav latérale — inutile dès qu'elle est visible (md+) */}
        <Link href={backHref} className="md:hidden text-white/60 hover:text-white text-xl leading-none">←</Link>
        <div>
          <p className="font-sora font-bold text-lg md:text-2xl leading-tight">{title}</p>
          {subtitle && <p className="text-white/50 text-xs md:text-sm font-dm">{subtitle}</p>}
        </div>
      </div>
    </header>
  );
}
