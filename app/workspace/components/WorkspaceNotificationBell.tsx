"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchNotifications,
  setNotificationRead,
  type WorkspaceNotification,
} from "../hooks/workspaceNotificationApi";

const POLL_INTERVAL_MS = 20_000;

function formatAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Old-app parity: the mindmap notification bell (inventory §10), 20s REST
 *  poll rather than push. Click-through marks read and opens the board. */
export function WorkspaceNotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      void fetchNotifications().then((list) => {
        if (!cancelled) setNotifications(list);
      });
    };
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpen = (notification: WorkspaceNotification) => {
    if (!notification.read) {
      setNotifications((current) =>
        current.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
      void setNotificationRead(notification.id, true);
    }
    setOpen(false);
    router.push(`/workspace?id=${notification.boardId}`);
  };

  const handleMarkAllRead = () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    setNotifications((current) => current.map((n) => (n.read ? n : { ...n, read: true })));
    for (const item of unread) {
      void setNotificationRead(item.id, true);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors cursor-pointer data-[state=open]:bg-orange-500/10 data-[state=open]:text-orange-600 text-slate-655 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto p-0 rounded-xl z-50">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.length === 0 && (
            <p className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500">No notifications yet.</p>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleOpen(n)}
              className={`block w-full px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${n.read ? "opacity-60" : ""}`}
            >
              <p className="truncate text-slate-600 dark:text-slate-300">{n.body}</p>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {formatAgo(n.createdAt)}
              </span>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default WorkspaceNotificationBell;
