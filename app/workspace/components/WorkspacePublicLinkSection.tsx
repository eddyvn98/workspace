"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Globe, Loader2, Copy, Check, Clock3, Link2Off } from "lucide-react";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  PUBLIC_LINK_EXPIRATION_OPTIONS,
  type PublicLinkExpiration,
} from "@/lib/workspace/public-link";
import {
  fetchPublicLinkState,
  enablePublicLink,
  updatePublicLinkExpiration,
  revokePublicLink,
} from "../hooks/workspacePublicLinkApi";

interface WorkspacePublicLinkSectionProps {
  boardId: string;
}

export function WorkspacePublicLinkSection({ boardId }: WorkspacePublicLinkSectionProps) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [expiration, setExpiration] = useState<PublicLinkExpiration>("7d");
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPublicLinkState(boardId);
      if (!data) return;
      setEnabled(data.enabled);
      setUrl(data.url);
      setExpiresAt(data.expiresAt);
      if (!data.expiresAt) {
        setExpiration("never");
      } else if (!PUBLIC_LINK_EXPIRATION_OPTIONS.some((option) => option.value !== "custom" && option.value === data.expiresAt)) {
        setExpiration(data.expiresAt);
      }
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = useCallback(async () => {
    setToggling(true);
    try {
      if (enabled) {
        const res = await revokePublicLink(boardId);
        if (res) {
          setEnabled(false);
          setUrl(null);
          setExpiresAt(null);
          toast.success("Public share link revoked");
        } else {
          toast.error("Failed to revoke share link");
        }
      } else {
        const res = await enablePublicLink(boardId, isCustomMode && dateRange?.to ? dateRange.to.toISOString() : expiration);
        if (res) {
          setEnabled(true);
          setUrl(res.url);
          setExpiresAt(res.expiresAt);
          toast.success("Public share link enabled");
        } else {
          toast.error("Failed to enable share link");
        }
      }
    } catch {
      toast.error("Failed to update share link");
    } finally {
      setToggling(false);
    }
  }, [boardId, enabled, expiration, isCustomMode, dateRange]);

  const handleExpirationChange = useCallback(
    async (value: PublicLinkExpiration) => {
      setExpiration(value);
      if (!enabled) return;
      try {
        const res = await updatePublicLinkExpiration(boardId, value);
        if (res) {
          setExpiresAt(res.expiresAt);
          toast.success("Share link expiration updated");
        } else {
          toast.error("Failed to update expiration");
        }
      } catch {
        toast.error("Failed to update expiration");
      }
    },
    [boardId, enabled]
  );

  const handleSelectChange = useCallback((value: PublicLinkExpiration) => {
    if (value === "custom") {
      setIsCustomMode(true);
      setExpiration("custom");
      return;
    }
    setIsCustomMode(false);
    void handleExpirationChange(value);
  }, [handleExpirationChange]);

  const handleCopy = useCallback(() => {
    if (!url || typeof window === "undefined") return;
    const fullUrl = `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      toast.success("Share link copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    });
  }, [url]);

  return (
    <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" />
          Public view link
        </label>
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading || toggling}
          role="switch"
          aria-checked={enabled}
          className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-40 ${
            enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
          }`}
          title={enabled ? "Disable public link" : "Enable public link"}
        >
          {toggling ? (
            <Loader2 className="w-3 h-3 animate-spin absolute top-1 left-1 text-white" />
          ) : (
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-4" : ""
              }`}
            />
          )}
        </button>
      </div>

      <p className="text-[11px] text-slate-400 text-left">
        Anyone with this link can view the map without signing in. No editing.
      </p>

      <div className="flex items-center gap-2">
        <Clock3 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <label
          htmlFor="workspace-public-link-expiration"
          className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap"
        >
          Expires
        </label>
        <select
          id="workspace-public-link-expiration"
          value={expiration}
          disabled={loading || toggling}
          onChange={(e) => handleSelectChange(e.target.value as PublicLinkExpiration)}
          className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none text-slate-700 dark:text-slate-200"
        >
          {PUBLIC_LINK_EXPIRATION_OPTIONS.filter((option) => option.value !== "1h").map((option) => {
            const customValue = option.value === "custom" && !isCustomMode && !PUBLIC_LINK_EXPIRATION_OPTIONS.some((item) => item.value === expiration)
              ? expiration
              : option.value;
            const label = option.value === "custom" && customValue !== "custom"
              ? `Custom (until ${new Date(customValue).toLocaleDateString()})`
              : option.label;
            return <option key={option.value} value={customValue}>{label}</option>;
          })}
        </select>
      </div>

      {isCustomMode && (
        <div className="mt-2 flex justify-center overflow-y-auto rounded-xl border bg-white shadow-sm dark:bg-slate-900 max-h-[320px]">
          <Calendar
            mode="range"
            numberOfMonths={4}
            classNames={{
              months: "flex flex-col space-y-3",
              month: "space-y-2",
              caption_label: "text-[13px] font-semibold",
              table: "w-full border-collapse space-y-0",
              head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[11px]",
              row: "flex w-full mt-1",
              cell: "h-8 w-8 text-center text-xs p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
              day: cn(
                buttonVariants({ variant: "ghost" }),
                "h-8 w-8 p-0 font-normal aria-selected:opacity-100 text-[11px]"
              ),
            }}
            disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
            selected={dateRange}
            onSelect={(range) => {
              setDateRange(range);
              if (range?.to) {
                void handleExpirationChange(range.to.toISOString());
                setIsCustomMode(false);
              }
            }}
            className="p-2"
          />
        </div>
      )}

      {enabled && expiresAt && (
        <div className="text-[10px] text-slate-400 text-left">
          Expires {new Date(expiresAt).toLocaleString()}
        </div>
      )}

      {enabled && url && (
        <>
          <div className="flex gap-2">
            <input
              readOnly
              value={typeof window !== "undefined" ? `${window.location.origin}${url}` : url}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none select-all"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="p-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors flex-shrink-0 flex items-center justify-center"
              title="Copy link"
              aria-label="Copy link"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 disabled:opacity-50 transition-colors"
          >
            <Link2Off className="w-3.5 h-3.5" />
            Revoke public link
          </button>
        </>
      )}
    </div>
  );
}

export default WorkspacePublicLinkSection;
