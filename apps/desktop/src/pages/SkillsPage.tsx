import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Sparkles,
  Search,
  RotateCw,
  AlertTriangle,
  FolderPlus,
  Trash2,
  Loader2,
  X,
  Layers,
  ChevronRight,
  Terminal,
  FolderOpen,
  Plus,
} from "lucide-react";
import type {
  SkillMetadata,
  UserExperienceMode,
  ExternalSkillSourceConfig,
} from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { bridge } from "../api/bridge.js";

interface SkillsPageProps {
  uxMode: UserExperienceMode;
  projectId?: string;
  projectRoot?: string;
}

// Bulletproof stringifier: guarantees React Error #31 NEVER happens on any dynamic property
const toText = (val: any, fallback = "", lang = "zh-CN"): string => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object") {
    // If it's a localized object, e.g. { "zh-CN": "...", "en-US": "..." }
    const localized =
      val[lang] ||
      val["zh-CN"] ||
      val["en-US"] ||
      val["ja-JP"] ||
      val["de-DE"] ||
      val["zh"] ||
      val["en"];
    if (typeof localized === "string") return localized;
    if (localized && typeof localized !== "object") return String(localized);
    try {
      return Object.entries(val)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(", ");
    } catch {
      return fallback;
    }
  }
  return String(val);
};

// Safe formatting helper to guarantee React never throws Error #31
const safeFormatItem = (item: any): string => {
  if (!item) return "";
  if (typeof item === "string") return item;
  if (typeof item === "object") {
    try {
      return Object.entries(item)
        .map(([k, v]) => {
          if (typeof v === "string") return `${k}: ${v}`;
          if (Array.isArray(v)) {
            return `${k}: [${v.map((sub) => (typeof sub === "object" ? JSON.stringify(sub) : String(sub))).join(", ")}]`;
          }
          return `${k}: ${JSON.stringify(v)}`;
        })
        .join(", ");
    } catch {
      return String(item);
    }
  }
  return String(item);
};

export const SkillsPage: React.FC<SkillsPageProps> = ({
  uxMode: _uxMode,
  projectId,
  projectRoot: _projectRoot,
}) => {
  const { language, tText } = useTranslation();
  const isZh = language.startsWith("zh");

  // Skills state
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Navigation Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all"); // "all", "warn", or source id

  // Try-Trigger State
  const [tryPrompt, setTryPrompt] = useState("");

  // External Sources State
  const [externalSources, setExternalSources] = useState<ExternalSkillSourceConfig[]>([]);
  const [isSourcesDrawerOpen, setIsSourcesDrawerOpen] = useState(false);
  const [customPathInput, setCustomPathInput] = useState("");
  const [isMounting, setIsMounting] = useState(false);

  // Selected Detail Skill Drawer
  const [selectedSkill, setSelectedSkill] = useState<SkillMetadata | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<{
    title: string;
    description?: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (
    title: string,
    description?: string,
    type: "success" | "error" = "success"
  ) => {
    setToastMessage({ title, description, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Load External Sources
  const loadExternalSources = useCallback(async () => {
    try {
      const res = await bridge.getExternalSkillSources();
      setExternalSources(res.sources || []);
    } catch {}
  }, []);

  // 2. Load Skills
  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await bridge.listSkills({ projectId });
      setSkills(res.skills || []);
    } catch (err: any) {
      setError(err?.message || (isZh ? "获取技能失败" : "Failed to load skills"));
    } finally {
      setLoading(false);
    }
  }, [projectId, isZh]);

  useEffect(() => {
    loadSkills();
    loadExternalSources();
  }, [loadSkills, loadExternalSources]);

  // Handle Full Reload / Rescan
  const handleRescan = async () => {
    setReloading(true);
    try {
      const res = await bridge.reloadSkills();
      setSkills(res.skills || []);
      await loadExternalSources();
      showToast(isZh ? "已重新扫描已挂载的技能目录" : "Rescanned all mounted skill directories");
    } catch (err: any) {
      showToast(isZh ? "重新扫描失败" : "Rescan failed", err?.message, "error");
    } finally {
      setReloading(false);
    }
  };

  // Toggle Single Skill
  const handleToggleSkill = async (skill: SkillMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const nextState = !skill.enabled;
      await bridge.toggleSkill(skill.id, nextState);
      setSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, enabled: nextState } : s))
      );
      if (selectedSkill?.id === skill.id) {
        setSelectedSkill({ ...selectedSkill, enabled: nextState });
      }
    } catch (err: any) {
      showToast(isZh ? "切换状态失败" : "Failed to toggle skill", err?.message, "error");
    }
  };

  // Toggle Source
  const handleToggleSource = async (id: string, enabled: boolean) => {
    try {
      const res = await bridge.toggleExternalSkillSource(id, enabled);
      setExternalSources(res.sources || []);
      await loadSkills();
      showToast(isZh ? "已更新来源状态" : "Updated source status");
    } catch (err: any) {
      showToast(isZh ? "更新来源失败" : "Failed to update source", err?.message, "error");
    }
  };

  // Mount Custom External Directory
  const handleMountCustomPath = async (pathToMount?: string) => {
    const targetPath = (pathToMount || customPathInput).trim();
    if (!targetPath) return;
    setIsMounting(true);
    try {
      const res = await bridge.addExternalSkillSource(targetPath);
      setExternalSources(res.sources || []);
      if (!pathToMount) setCustomPathInput("");
      await loadSkills();
      showToast(
        isZh
          ? "已成功挂载外部技能目录 (零拷贝直读)"
          : "Successfully mounted skill directory (Zero-Copy)"
      );
    } catch (err: any) {
      showToast(isZh ? "挂载失败" : "Failed to mount directory", err?.message, "error");
    } finally {
      setIsMounting(false);
    }
  };

  // Remove / Delete External Source
  const handleRemoveSource = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await bridge.removeExternalSkillSource(id);
      setExternalSources(res.sources || []);
      await loadSkills();
      showToast(isZh ? "已成功移除该挂载目录" : "Successfully removed mounted directory");
    } catch (err: any) {
      showToast(isZh ? "移除失败" : "Failed to remove source", err?.message, "error");
    }
  };

  // Dynamic Try-Trigger Hit Matching
  const hitSkillIds = useMemo(() => {
    const q = tryPrompt.trim().toLowerCase();
    if (!q) return new Set<string>();

    const hits = new Set<string>();
    for (const s of skills) {
      if (!s.enabled || s.isAvailable === false) continue;
      const triggers = s.triggers || [];
      const hasHit = triggers.some((t) => {
        const str = safeFormatItem(t).toLowerCase();
        return q.includes(str) || str.includes(q);
      });
      if (hasHit) {
        hits.add(s.id);
      }
    }
    return hits;
  }, [tryPrompt, skills]);

  // Filter skills based on Active Nav Filter and Search
  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return skills
      .filter((s) => {
        const isOrchestrator = s.id === "nexus.meta-orchestrator";

        // 1. Nav Filter
        if (activeFilter === "all") {
          // Default user view: pure blank unless external skill or the meta-orchestrator
          if (s.source === "builtin" && !isOrchestrator) {
            return false;
          }
        } else if (activeFilter === "warn") {
          if (s.isAvailable !== false && !s.readError) return false;
        } else if (activeFilter === "builtin") {
          if (s.source !== "builtin" && s.originAgent !== "gb") return false;
        } else {
          // Match specific external source by ID or path
          const matchingSource = externalSources.find((src) => src.id === activeFilter);
          if (matchingSource) {
            const normSource = matchingSource.path.toLowerCase().replace(/\\/g, "/").replace(/\/+$/, "");
            const normSkill = (s.sourcePath || "").toLowerCase().replace(/\\/g, "/");
            if (
              !normSkill.startsWith(normSource) &&
              !normSkill.includes(normSource) &&
              s.originAgent !== matchingSource.id
            ) {
              return false;
            }
          } else if (s.originAgent !== activeFilter && s.source !== activeFilter) {
            return false;
          }
        }

        // 2. Search query
        if (q) {
          const nameStr = (
            typeof s.name === "string" ? s.name : `${s.name?.["en-US"]} ${s.name?.["zh-CN"]}`
          ).toLowerCase();
          const descStr = (
            typeof s.description === "string"
              ? s.description
              : `${s.description?.["en-US"]} ${s.description?.["zh-CN"]}`
          ).toLowerCase();
          const trigStr = (s.triggers || []).map(safeFormatItem).join(" ").toLowerCase();
          const toolStr = (s.tools || []).map(safeFormatItem).join(" ").toLowerCase();
          const match =
            nameStr.includes(q) ||
            descStr.includes(q) ||
            trigStr.includes(q) ||
            toolStr.includes(q) ||
            s.id.toLowerCase().includes(q);
          if (!match) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Meta-orchestrator skill is pinned at the very top!
        if (a.id === "nexus.meta-orchestrator") return -1;
        if (b.id === "nexus.meta-orchestrator") return 1;
        return 0;
      });
  }, [skills, activeFilter, searchQuery, externalSources]);

  // Dynamic Navigation counts
  const navCounts = useMemo(() => {
    const visibleAll = skills.filter((s) => s.source !== "builtin" || s.id === "nexus.meta-orchestrator");
    const counts: Record<string, number> = {
      all: visibleAll.length,
      warn: visibleAll.filter((s) => s.isAvailable === false || Boolean(s.readError)).length,
    };
    for (const src of externalSources) {
      const normSource = src.path.toLowerCase().replace(/\\/g, "/").replace(/\/+$/, "");
      counts[src.id] = skills.filter((s) => {
        if (s.originAgent === src.id) return true;
        if (!s.sourcePath) return false;
        const normSkill = s.sourcePath.toLowerCase().replace(/\\/g, "/");
        return normSkill.startsWith(normSource) || normSkill.includes(normSource);
      }).length;
    }
    return counts;
  }, [skills, externalSources]);

  const enabledSourcesCount = externalSources.filter((s) => s.enabled).length;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#f8faf9] dark:bg-[#070e0c] text-slate-800 dark:text-emerald-100 font-sans select-none overflow-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[80] max-w-sm p-3.5 rounded-xl shadow-xl bg-white dark:bg-[#0d1613] border border-emerald-500/30 text-xs flex items-start gap-2.5 animate-in slide-in-from-top-2 duration-200">
          <Sparkles className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900 dark:text-white">
              {toastMessage.title}
            </div>
            {toastMessage.description && (
              <div className="text-slate-500 dark:text-emerald-400/80 mt-0.5 text-[11px] truncate">
                {toastMessage.description}
              </div>
            )}
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-emerald-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="flex items-center gap-3 px-6 py-3.5 border-b border-slate-200 dark:border-emerald-500/20 bg-white dark:bg-[#0e1714] shrink-0">
        <div className="flex items-center gap-2 mr-2">
          <Sparkles className="w-5 h-5 text-emerald-500" />
          <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            {tText("技能中心", "Skills Hub", "スキルハブ", "Skill-Zentrum")}
          </h1>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-emerald-500/60" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tText(
              "搜索技能名称、触发词或依赖工具...",
              "Search by skill name, trigger keywords, or tools...",
              "スキル名、トリガー、ツールを検索...",
              "Nach Skill-Name, Triggern oder Tools suchen..."
            )}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-100 dark:bg-emerald-950/30 border border-slate-200 dark:border-emerald-500/20 rounded-lg text-xs text-slate-800 dark:text-emerald-100 placeholder-slate-400 dark:placeholder-emerald-500/40 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Open Sources Drawer Button */}
          <button
            type="button"
            onClick={() => setIsSourcesDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-emerald-950/40 hover:bg-slate-200 dark:hover:bg-emerald-900/40 text-slate-700 dark:text-emerald-300 border border-slate-200 dark:border-emerald-500/20 rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-500" />
            <span>
              {tText(
                `挂载管理 ${enabledSourcesCount}/${externalSources.length}`,
                `Sources ${enabledSourcesCount}/${externalSources.length}`,
                `ソース管理 ${enabledSourcesCount}/${externalSources.length}`,
                `Quellen ${enabledSourcesCount}/${externalSources.length}`
              )}
            </span>
          </button>

          {/* Rescan Button */}
          <button
            type="button"
            onClick={handleRescan}
            disabled={reloading || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-emerald-950/40 hover:bg-slate-200 dark:hover:bg-emerald-900/40 text-slate-700 dark:text-emerald-300 border border-slate-200 dark:border-emerald-500/20 rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${reloading ? "animate-spin" : ""}`} />
            <span>{tText("重新扫描", "Rescan", "再スキャン", "Neu scannen")}</span>
          </button>

          {/* Mount Directory Button */}
          <button
            type="button"
            onClick={() => setIsSourcesDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>{tText("挂载技能目录", "Mount Directory", "ディレクトリをマウント", "Verzeichnis mounten")}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Nav Filter Sidebar */}
        <nav className="w-56 border-r border-slate-200 dark:border-emerald-500/20 bg-white dark:bg-[#0b1310] p-3 space-y-4 shrink-0 overflow-y-auto">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                activeFilter === "all"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold"
                  : "text-slate-600 dark:text-emerald-400/70 hover:bg-slate-100 dark:hover:bg-emerald-950/30"
              }`}
            >
              <span>{tText("全部技能", "All Skills", "すべてのスキル", "Alle Skills")}</span>
              <span className="font-mono text-[11px] opacity-75">{navCounts.all}</span>
            </button>
          </div>

          {/* User Mounted Sources Section */}
          {externalSources.length > 0 && (
            <div className="space-y-1">
              <h4 className="px-3 text-[11px] font-semibold text-slate-400 dark:text-emerald-500/50 uppercase tracking-wider">
                {tText("已挂载目录来源", "Mounted Sources", "マウントされたソース", "Gemountete Quellen")}
              </h4>

              {externalSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => setActiveFilter(source.id)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    activeFilter === source.id
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold"
                      : "text-slate-600 dark:text-emerald-400/70 hover:bg-slate-100 dark:hover:bg-emerald-950/30"
                  }`}
                >
                  <span className="truncate pr-1">{source.name}</span>
                  <span className="font-mono text-[11px] opacity-75 shrink-0">
                    {navCounts[source.id] || 0}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Needs Attention Section (Only when errors exist) */}
          {navCounts.warn > 0 && (
            <div className="space-y-1">
              <h4 className="px-3 text-[11px] font-semibold text-slate-400 dark:text-emerald-500/50 uppercase tracking-wider">
                {tText("需要处理", "Needs Attention", "対応が必要", "Erfordert Aufmerksamkeit")}
              </h4>
              <button
                type="button"
                onClick={() => setActiveFilter("warn")}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  activeFilter === "warn"
                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold"
                    : "text-slate-600 dark:text-emerald-400/70 hover:bg-slate-100 dark:hover:bg-emerald-950/30"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span>{tText("读取异常 / 损坏", "Read Errors", "読み込みエラー", "Lesefehler")}</span>
                </div>
                <span className="font-mono text-[11px] opacity-75">{navCounts.warn}</span>
              </button>
            </div>
          )}
        </nav>

        {/* Center Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto p-5 space-y-4">
          {/* Try-Trigger Interactive Box */}
          <div className="p-3.5 rounded-xl border border-dashed border-slate-300 dark:border-emerald-500/30 bg-white dark:bg-[#0e1714] space-y-1.5 shadow-2xs">
            <input
              type="text"
              value={tryPrompt}
              onChange={(e) => setTryPrompt(e.target.value)}
              placeholder={tText(
                "试触发：输入自然语言指令，看看哪些技能会被精准匹配",
                "Try Trigger: enter a task prompt to see which skills will auto-match",
                "トリガー試行: 自然言語を入力してマッチするスキルを確認",
                "Trigger-Test: Geben Sie eine Anweisung ein, um passende Skills zu sehen"
              )}
              className="w-full bg-transparent border-none text-xs font-medium text-slate-900 dark:text-emerald-100 placeholder-slate-400 dark:placeholder-emerald-500/40 focus:outline-none"
            />
            <div className="text-[11px] text-slate-500 dark:text-emerald-400/70">
              {tryPrompt.trim() ? (
                hitSkillIds.size > 0 ? (
                  <span>
                    {tText("会自动选中 ", "Will auto-match ", "自動マッチ: ", "Wird automatisch übereinstimmen: ")}
                    <b className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      {hitSkillIds.size}
                    </b>
                    {tText(" 个技能：", " skills: ", " 個のスキル: ", " Skills: ")}
                    <span className="font-mono text-emerald-700 dark:text-emerald-300 font-semibold">
                      {Array.from(hitSkillIds).slice(0, 5).join(", ")}
                      {hitSkillIds.size > 5 ? "..." : ""}
                    </span>
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">
                    {tText(
                      "未匹配到任何技能。可为技能补充触发词。",
                      "No skills matched. You can add trigger keywords to relevant skills.",
                      "マッチするスキルがありません。トリガーキーワードを追加できます。",
                      "Keine Skills gefunden. Fügen Sie Trigger-Keywords hinzu."
                    )}
                  </span>
                )
              ) : (
                <span>
                  {tText(
                    "例如：帮我调一下 bug、分析项目结构、运行单元测试",
                    "e.g.: Help me debug this bug, inspect project structure, or run tests",
                    "例: バグを修正して、プロジェクト構造を分析、テストを実行",
                    "z. B.: Fehler beheben, Projektstruktur analysieren, Tests ausführen"
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
              <span>{toText(error)}</span>
              <button
                onClick={() => setError(null)}
                className="text-xs text-rose-500 hover:underline cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-emerald-500/60 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <div className="text-xs">{tText("正在加载技能列表...", "Loading skills...", "スキルを読み込み中...", "Skills werden geladen...")}</div>
            </div>
          ) : filteredSkills.length === 0 ? (
            /* Pure Blank Initial Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border border-dashed border-slate-300 dark:border-emerald-500/20 rounded-2xl bg-white/60 dark:bg-[#0e1714]/60 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-sm">
                <FolderOpen className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {tText("暂未挂载任何技能目录", "No Skill Directories Mounted", "スキルディレクトリがマウントされていません", "Keine Skill-Verzeichnisse gemountet")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-emerald-400/70 leading-relaxed">
                  {tText(
                    "Nexus 以纯净无捆绑模式启动。您可以点击下方按钮挂载自己的本地技能文件夹，零拷贝直读，随时可解除挂载。",
                    "Nexus starts in pure mode with zero preloaded bloat. Click below to mount your local skill directories with zero-copy reading.",
                    "Nexusはクリーンな状態で起動します。下のボタンからローカルディレクトリをマウントできます。",
                    "Nexus startet im reinen Modus ohne Ballast. Klicken Sie unten, um lokale Skill-Verzeichnisse zu mounten."
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSourcesDrawerOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
              >
                <FolderPlus className="w-4 h-4" />
                <span>{tText("挂载本地技能目录", "Mount Skill Directory", "ディレクトリをマウント", "Skill-Verzeichnis mounten")}</span>
              </button>
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="text-center py-16 text-slate-400 dark:text-emerald-500/60 text-xs">
              {tText(
                "没有匹配的技能，换个关键词或分类试试。",
                "No matching skills found. Try another keyword or filter.",
                "マッチするスキルがありません。別のキーワードまたはフィルターをお試しください。",
                "Keine passenden Skills gefunden. Versuchen Sie ein anderes Stichwort oder einen anderen Filter."
              )}
            </div>
          ) : (
            /* Skills List */
            <div className="border border-slate-200 dark:border-emerald-500/20 rounded-xl divide-y divide-slate-200 dark:divide-emerald-500/10 overflow-hidden bg-white dark:bg-[#0e1714]">
              {filteredSkills.map((skill) => {
                const displayName = toText(
                  typeof skill.name === "string"
                    ? skill.name
                    : skill.name?.[language] ||
                      skill.name?.["en-US"] ||
                      skill.name?.["zh-CN"] ||
                      skill.id,
                  skill.id,
                  language
                );
                const desc = toText(
                  typeof skill.description === "string"
                    ? skill.description
                    : skill.description?.[language] ||
                      skill.description?.["en-US"] ||
                      skill.description?.["zh-CN"] ||
                      skill.summary ||
                      "",
                  "",
                  language
                );

                const isHit = hitSkillIds.size > 0 && hitSkillIds.has(skill.id);
                const isDimmed = hitSkillIds.size > 0 && !hitSkillIds.has(skill.id);
                const hasReadError = skill.isAvailable === false || Boolean(skill.readError);
                const isManualOnly = (skill.triggers || []).length === 0;

                return (
                  <div
                    key={skill.id}
                    onClick={() => setSelectedSkill(skill)}
                    className={`flex items-center gap-3.5 px-4 py-3 cursor-pointer transition ${
                      isHit
                        ? "bg-emerald-500/15 dark:bg-emerald-950/50"
                        : isDimmed
                        ? "opacity-35"
                        : "hover:bg-emerald-500/5 dark:hover:bg-emerald-950/20"
                    }`}
                  >
                    {/* High-Contrast Beautiful Toggle Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={skill.enabled}
                      onClick={(e) => handleToggleSkill(skill, e)}
                      title={skill.enabled ? tText("已启用", "Enabled", "有効", "Aktiviert") : tText("已禁用", "Disabled", "無効", "Deaktiviert")}
                      className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out border-2 border-transparent focus:outline-none ${
                        skill.enabled
                          ? "bg-emerald-600 dark:bg-emerald-500"
                          : "bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          skill.enabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>

                    {/* Skill Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-900 dark:text-emerald-100 truncate">
                          {displayName}
                        </span>
                        {skill.id === "nexus.meta-orchestrator" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 shadow-2xs">
                            <Sparkles className="w-3 h-3 text-amber-500" />
                            {tText("四元工具调度中枢", "Core Meta-Orchestrator", "メタオーケストレーター中核", "Meta-Orchestrator Kern")}
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-slate-400 dark:text-emerald-500/60 truncate">
                          {skill.id}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-emerald-400/60 truncate mt-0.5">
                        {desc}
                      </div>
                    </div>

                    {/* Right Flags & Risk Dot */}
                    <div className="flex items-center gap-2 shrink-0">
                      {hasReadError && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">
                          {tText("读取异常", "Read Error", "読み込みエラー", "Lesefehler")}
                        </span>
                      )}

                      {isManualOnly && !hasReadError && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                          {tText("仅手动", "Manual Only", "手動のみ", "Nur manuell")}
                        </span>
                      )}

                      {/* Risk Dot */}
                      <span
                        title={
                          skill.risk === "high"
                            ? tText("高风险：需要人工核准", "High Risk: Approval Required", "高リスク: 承認が必要", "Hohes Risiko: Genehmigung erforderlich")
                            : skill.risk === "medium"
                            ? tText("中风险", "Medium Risk", "中リスク", "Mittleres Risiko")
                            : tText("安全运行", "Safe / Low Risk", "安全", "Sicher / Geringes Risiko")
                        }
                        className={`w-2 h-2 rounded-full ${
                          skill.risk === "high"
                            ? "bg-rose-500"
                            : skill.risk === "medium"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                      />

                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-emerald-500/40" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* --- Right Slide-Over Detail Drawer --- */}
      {selectedSkill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs cursor-pointer"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedSkill(null);
          }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md h-full bg-white dark:bg-[#0c1411] border-l border-slate-200 dark:border-emerald-500/20 shadow-2xl p-6 overflow-y-auto space-y-5 animate-in slide-in-from-right duration-200 cursor-default"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {toText(
                    typeof selectedSkill.name === "string"
                      ? selectedSkill.name
                      : selectedSkill.name?.[language] || selectedSkill.name?.["en-US"] || selectedSkill.id,
                    selectedSkill.id,
                    language
                  )}
                </h2>
                <div className="font-mono text-xs text-slate-400 dark:text-emerald-500/60 mt-0.5">
                  {toText(selectedSkill.id)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSkill(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-emerald-950/50 text-slate-400 dark:text-emerald-400/70 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Read Error Callout */}
            {selectedSkill.readError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                  <span>{tText("读取异常说明", "Read Error", "読み込みエラーの説明", "Erklärung zum Lesefehler")}</span>
                </div>
                <div className="font-mono text-[11px] leading-relaxed">
                  {toText(selectedSkill.readError)}
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1 text-xs text-slate-600 dark:text-emerald-200/80 leading-relaxed">
              <div className="text-[11px] font-semibold uppercase text-slate-400 dark:text-emerald-500/60 tracking-wider">
                {tText("技能描述", "Description", "スキルの説明", "Skill-Beschreibung")}
              </div>
              <div>
                {toText(
                  typeof selectedSkill.description === "string"
                    ? selectedSkill.description
                    : selectedSkill.description?.[language] ||
                      selectedSkill.description?.["en-US"] ||
                      selectedSkill.summary ||
                      tText("暂无描述", "No description provided.", "説明はありません。", "Keine Beschreibung verfügbar."),
                  tText("暂无描述", "No description provided.", "説明はありません。", "Keine Beschreibung verfügbar."),
                  language
                )}
              </div>
            </div>

            {/* Meta Tags */}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-emerald-950/50 text-slate-600 dark:text-emerald-300 border border-slate-200 dark:border-emerald-500/20">
                {selectedSkill.source === "external" ? tText("外部挂载", "Mounted", "マウント済み", "Gemountet") : tText("内置", "Built-in", "内蔵", "Integriert")}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full border ${
                  selectedSkill.risk === "high"
                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                    : selectedSkill.risk === "medium"
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                }`}
              >
                {selectedSkill.risk === "high"
                  ? tText("高风险", "High Risk", "高リスク", "Hohes Risiko")
                  : selectedSkill.risk === "medium"
                  ? tText("中风险", "Medium Risk", "中リスク", "Mittleres Risiko")
                  : tText("安全 (Safe)", "Safe / Low", "安全", "Sicher / Gering")}
              </span>
            </div>

            {/* Trigger Keywords */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-slate-400 dark:text-emerald-500/60 tracking-wider">
                {tText("触发词 (Triggers)", "Triggers", "トリガー (Triggers)", "Trigger (Auslöser)")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(selectedSkill.triggers || []).length > 0 ? (
                  selectedSkill.triggers.map((t, idx) => (
                    <span
                      key={idx}
                      className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-emerald-950/40 text-slate-700 dark:text-emerald-200 border border-slate-200 dark:border-emerald-500/20"
                    >
                      {safeFormatItem(t)}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 dark:text-emerald-500/50">
                    {tText("无指定触发词", "None specified", "指定されたトリガーはありません", "Keine Trigger angegeben")}
                  </span>
                )}
              </div>
            </div>

            {/* Workflow Steps */}
            {(selectedSkill.workflow || []).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-slate-400 dark:text-emerald-500/60 tracking-wider">
                  {tText("工作流步骤 (Workflow)", "Workflow Steps", "ワークフローステップ", "Workflow-Schritte")}
                </h3>
                <ol className="list-decimal pl-4 space-y-1.5 text-xs text-slate-700 dark:text-emerald-200/90">
                  {selectedSkill.workflow.map((step, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {safeFormatItem(step)}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Needed Tools */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-slate-400 dark:text-emerald-500/60 tracking-wider">
                {tText("依赖的工具 (Required Tools)", "Required Tools", "必要なツール", "Erforderliche Tools")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(selectedSkill.tools || []).length > 0 ? (
                  selectedSkill.tools.map((tool, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-mono px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 flex items-center gap-1"
                    >
                      <Terminal className="w-3 h-3 text-emerald-500" />
                      <span>{safeFormatItem(tool)}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 dark:text-emerald-500/50">
                    {tText("未声明工具", "No specific tools required", "必要なツールは宣言されていません", "Keine speziellen Tools erforderlich")}
                  </span>
                )}
              </div>
            </div>

            {/* Physical Source Path */}
            <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-emerald-500/20">
              <div className="text-[11px] font-semibold text-slate-400 dark:text-emerald-500/60">
                {tText("物理路径", "Filesystem Path", "ファイルパス", "Dateisystempfad")}
              </div>
              <div className="text-[11px] font-mono text-slate-600 dark:text-emerald-400/80 break-all bg-slate-50 dark:bg-emerald-950/20 p-2 rounded border border-slate-200 dark:border-emerald-500/10">
                {toText(selectedSkill.sourcePath, "N/A")}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* --- Sources Management Drawer --- */}
      {isSourcesDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-xs cursor-pointer"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsSourcesDrawerOpen(false);
          }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md h-full bg-white dark:bg-[#0c1411] border-l border-slate-200 dark:border-emerald-500/20 shadow-2xl p-6 overflow-y-auto space-y-5 animate-in slide-in-from-right duration-200 cursor-default"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-emerald-500/20 pb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-500" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {tText("挂载管理", "Sources Management", "ソース管理", "Quellenverwaltung")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsSourcesDrawerOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-emerald-950/50 text-slate-400 dark:text-emerald-400/70 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-emerald-400/70 leading-relaxed">
              {tText(
                "挂载的目录只读取，不复制。随时可以通过垃圾桶图标解除挂载并删除。",
                "Mounted skill directories are read with zero file duplication. You can unmount and delete any path anytime.",
                "マウントされたディレクトリは読み取り専用です。いつでもゴミ箱アイコンから解除できます。",
                "Gemountete Verzeichnisse sind schreibgeschützt. Sie können jederzeit entfernt werden."
              )}
            </p>

            {/* Mount Input Form (At TOP as requested) */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-emerald-500/20 bg-slate-50 dark:bg-[#0e1714] space-y-2">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-emerald-100">
                {tText("挂载本地外部目录", "Mount Local Skill Directory", "ローカル外部ディレクトリをマウント", "Lokales Skill-Verzeichnis mounten")}
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customPathInput}
                  onChange={(e) => setCustomPathInput(e.target.value)}
                  placeholder={tText(
                    "输入目录绝对路径，如 D:/my-skills",
                    "e.g.: D:/my-skills or /path/to/skills",
                    "絶対パスを入力 (例: D:/my-skills)",
                    "Absoluten Pfad eingeben, z. B. D:/my-skills"
                  )}
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-emerald-950/30 border border-slate-200 dark:border-emerald-500/20 rounded-lg text-xs font-mono text-slate-800 dark:text-emerald-100 placeholder-slate-400 dark:placeholder-emerald-500/40 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => handleMountCustomPath()}
                  disabled={isMounting || !customPathInput.trim()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                >
                  {isMounting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>{tText("添加", "Add", "追加", "Hinzufügen")}</span>
                </button>
              </div>
            </div>

            {/* Sources List */}
            <div className="space-y-2 pt-1">
              <h4 className="text-[11px] font-semibold text-slate-400 dark:text-emerald-500/60 uppercase tracking-wider">
                {tText("当前已挂载目录清单", "Currently Mounted Sources", "現在マウントされているソース", "Aktuell gemountete Quellen")}
              </h4>
              {externalSources.length === 0 ? (
                <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 dark:border-emerald-500/20 bg-slate-50 dark:bg-emerald-950/10 text-xs text-slate-400 dark:text-emerald-500/60">
                  {tText("当前未挂载任何外部目录", "No external directories mounted yet", "現在外部ディレクトリはマウントされていません", "Noch keine externen Verzeichnisse gemountet")}
                </div>
              ) : (
                externalSources.map((src) => (
                  <div
                    key={src.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-emerald-500/20 bg-slate-50 dark:bg-[#0e1714] space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-emerald-100 truncate pr-2">
                        {toText(src.name)}
                      </span>

                      <div className="flex items-center gap-2">
                        {/* Delete button (All external paths can be removed!) */}
                        <button
                          type="button"
                          onClick={(e) => handleRemoveSource(src.id, e)}
                          title={tText("删除/解绑此路径", "Delete / Unmount this path", "このパスを削除/マウント解除", "Diesen Pfad löschen / unmounten")}
                          className="p-1 rounded hover:bg-rose-500/20 text-rose-500 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {/* High-Contrast Beautiful Toggle Switch */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={src.enabled}
                          onClick={() => handleToggleSource(src.id, !src.enabled)}
                          title={src.enabled ? tText("已启用", "Enabled", "有効", "Aktiviert") : tText("已禁用", "Disabled", "無効", "Deaktiviert")}
                          className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out border-2 border-transparent focus:outline-none ${
                            src.enabled
                              ? "bg-emerald-600 dark:bg-emerald-500"
                              : "bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              src.enabled ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    <div className="font-mono text-[11px] text-slate-500 dark:text-emerald-500/60 break-all">
                      {toText(src.path)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
