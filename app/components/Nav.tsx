"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/app/components/ThemeToggle";

type NavItem = { href: string; label: string };
const ITEMS: NavItem[] = [
  { href: "/", label: "Inventory" },
  { href: "/sales", label: "Sales" },
];

export function Nav({ rightSlot }: { rightSlot?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div>
          <div className="brand">NookPaw Warehouse</div>
          <div className="brand-sub">Inventory & Sales Dashboard</div>
        </div>
        <nav className="nav-tabs">
          {ITEMS.map((i) => {
            const active =
              i.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                className={`nav-tab ${active ? "active" : ""}`}
              >
                {i.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="topbar-actions">
        <ThemeToggle />
        {rightSlot}
      </div>
    </div>
  );
}
