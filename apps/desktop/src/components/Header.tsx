import React from "react";
import {
  OctagonAlert,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type {
  McpStatus,
  ApprovalRoutingMode,
  UserExperienceMode,
  FullControlStatusDto,
} from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
  mcpStatus: McpStatus | null;
  approvalRoutingMode: ApprovalRoutingMode;
  onChangeApprovalRoutingMode: (mode: ApprovalRoutingMode) => Promise<void>;
  onTogglePause: () => void;
  onTriggerEmergencyStop: () => void;
  onRefreshAll: () => void;
  isRefreshing?: boolean;
  serverAvailable: boolean;
  lastSuccessfulRefresh: number | null;
  uxMode?: UserExperienceMode;
  fullControlStatus?: FullControlStatusDto | null;
  onOpenFullControl?: () => void;
  onStopFullControl?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  breadcrumb,
  mcpStatus,
  onTriggerEmergencyStop,
  onRefreshAll,
  isRefreshing,
  serverAvailable,
  fullControlStatus,
  onStopFullControl,
}) => {
  const { tText } = useTranslation();
  const isPaused = mcpStatus?.paused ?? false;

  return (
    <header className="h-14 px-6 bg-theme-header border-b border-theme-subtle flex items-center justify-between select-none shrink-0 z-10">
      {/* Left: Breadcrumbs & View Title */}
      <div className="flex items-center gap-2.5 min-w-0">
        {breadcrumb && (
          <>
            <span className="text-xs font-mono uppercase tracking-wider text-theme-muted">
              {breadcrumb}
            </span>
            <span className="text-theme-muted/40 text-xs">/</span>
          </>
        )}
        <h1 className="text-sm font-semibold text-theme-primary truncate">
          {title}
        </h1>
        {subtitle && (
          <span className="hidden xl:inline text-xs text-theme-muted truncate pl-2 border-l border-theme-subtle">
            {subtitle}
          </span>
        )}
      </div>

      {/* Right: Status Pill & Emergency Action */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Full Control Active Notice */}
        {fullControlStatus?.enabled && fullControlStatus.activeSession && (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-mono bg-amber-500/10 border border-amber-500/30 text-amber-500">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>
              {tText(
                "完全控制生效中",
                "Full Control Active",
                "フルコントロール有効",
                "Vollzugriff aktiv"
              )}
            </span>
            {onStopFullControl && (
              <button
                onClick={onStopFullControl}
                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 transition"
              >
                {tText("停止", "Stop", "停止", "Stopp")}
              </button>
            )}
          </div>
        )}

        {/* Global Connection Status Dot */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono border border-theme-subtle bg-theme-card/60">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              !serverAvailable
                ? "bg-red-500"
                : isPaused
                ? "bg-amber-500"
                : "bg-emerald-500"
            }`}
          />
          <span className="text-theme-secondary">
            {!serverAvailable
              ? tText("服务离线", "Offline", "オフライン", "Offline")
              : isPaused
              ? tText("AI 已暂停", "AI Paused", "AI一時停止中", "KI pausiert")
              : tText(
                  "服务已连接",
                  "Engine Connected",
                  "接続完了",
                  "Dienst verbunden"
                )}
          </span>
        </div>

        {/* Manual Refresh Button */}
        <button
          onClick={onRefreshAll}
          disabled={isRefreshing}
          title={tText(
            "刷新系统状态",
            "Refresh Status",
            "システム状態を更新",
            "Status aktualisieren"
          )}
          className="p-1.5 rounded-md text-theme-muted hover:text-theme-primary hover:bg-theme-card border border-theme-subtle transition disabled:opacity-40 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>

        {/* Emergency Stop Button */}
        <button
          onClick={onTriggerEmergencyStop}
          title={tText(
            "紧急熔断中止执行",
            "Emergency Stop Execution",
            "緊急停止",
            "Not-Halt Ausführung abbrechen"
          )}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition cursor-pointer"
        >
          <OctagonAlert className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {tText("紧急熔断", "Emergency Halt", "緊急停止", "Not-Halt")}
          </span>
        </button>
      </div>
    </header>
  );
};
