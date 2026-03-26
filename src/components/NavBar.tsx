"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/boards", label: "Browse" },
  { href: "/components", label: "Components" },
  { href: "/support", label: "Support" },
] as const;

function useSafePathname(): string {
  try {
    return usePathname() ?? "/";
  } catch {
    return "/";
  }
}

export default function NavBar() {
  const pathname = useSafePathname();

  return (
    <header className="border-b border-zinc-800">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-zinc-50"
        >
          PCSlotCheck
        </Link>
        <ul className="flex gap-6 text-sm">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`transition-colors hover:text-zinc-50 ${
                    isActive ? "text-zinc-50" : "text-zinc-400"
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
