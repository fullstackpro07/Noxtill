"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings, User } from "lucide-react";
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/lib/session";
import { logout } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth-store";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Best-effort — clear the local session and redirect regardless of whether the server call succeeded.
    }
    useAuthStore.getState().clearSession();
    router.push("/login");
  }

  return (
    <DropdownMenu>
      <DropdownTrigger>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials(user.name)}
        </span>
      </DropdownTrigger>
      <DropdownContent className="w-56" align="end">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium text-fg">{user.name}</p>
          <p className="truncate text-xs text-fg-faint">{user.email}</p>
          <span className="mt-1.5 inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium capitalize text-fg-muted">
            {user.role}
          </span>
        </div>
        <div className="my-1 h-px bg-border" />
        <DropdownItem>
          <User className="h-4 w-4 text-fg-faint" aria-hidden />
          My profile
        </DropdownItem>
        <DropdownItem>
          <Settings className="h-4 w-4 text-fg-faint" aria-hidden />
          Settings
        </DropdownItem>
        <div className="my-1 h-px bg-border" />
        <DropdownItem onSelect={handleLogout} className="text-destructive hover:bg-destructive/8">
          <LogOut className="h-4 w-4" aria-hidden />
          Log out
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}
