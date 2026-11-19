import React, { useState, useEffect } from "react";
import { MessageSquare, X, Sparkles, MessageCircle, Users, ZoomIn } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation.js";
import wechatImg from "../../assets/contact/wechat.jpg";
import telegramImg from "../../assets/contact/telegram.png";
import whatsappImg from "../../assets/contact/whatsapp.png";
import lineImg from "../../assets/contact/line.jpg";
import qqGroupImg from "../../assets/contact/qq-group.jpg";
import telegramGroupImg from "../../assets/contact/telegram-group.jpg";

export interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "community" | "contact";
}

export type SponsorModalProps = ContactModalProps;

export const ContactModal: React.FC<ContactModalProps> = ({
  isOpen,
  onClose,
  initialTab = "community",
}) => {
  const { tText } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<"community" | "contact">(initialTab);
  const [subFilter, setSubFilter] = useState<string>("all");

  const [zoomedItem, setZoomedItem] = useState<{
    src: string;
    name: string;
    handle: string;
    desc: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveCategory(initialTab);
      setSubFilter("all");
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const communityGroups = [
    {
      id: "qq-group",
      name: tText("QQ 官方交流群", "QQ Community Group", "QQ 公式コミュニティ", "QQ-Community-Gruppe"),
      handle: "1131916140",
      extra: tText("Webagent 群号: 1131916140", "Webagent Group ID: 1131916140", "Webagent グループID: 1131916140", "Webagent Gruppen-ID: 1131916140"),
      desc: tText("扫码加入官方 QQ 交流群，探讨 Agent 与本地自动化工作流", "Scan to join QQ group for Agent & local automation discussions", "公式QQグループに参加して、Agentと自動化ワークフローを探求", "Scannen Sie den QR-Code, um der offiziellen QQ-Gruppe beizutreten"),
      img: qqGroupImg,
      color: "from-blue-500/10 to-blue-500/5",
      badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      badgeText: tText("官方交流群", "Official Group", "公式グループ", "Offizielle Gruppe"),
    },
    {
      id: "telegram-group",
      name: tText("Telegram 官方讨论群", "Telegram Community Group", "Telegram 公式グループ", "Telegram-Community-Gruppe"),
      handle: "@YSUN_WEBAI",
      extra: "@YSUN_WEBAI",
      desc: tText("扫码加入 Telegram 讨论群组，跨平台畅聊 Agent 实践与心得", "Scan to join Telegram community group for worldwide Agent discussions", "Telegramコミュニティに参加して、Agentの知見を共有", "Treten Sie der Telegram-Gruppe bei, um weltweite Agent-Erfahrungen zu teilen"),
      img: telegramGroupImg,
      color: "from-indigo-500/10 to-indigo-500/5",
      badgeColor: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      badgeText: tText("官方讨论群", "Discussion Group", "ディスカッショングループ", "Diskussionsgruppe"),
    },
  ];

  const personalContacts = [
    {
      id: "wechat",
      name: tText("微信 (WeChat)", "WeChat", "WeChat (ウィーチャット)", "WeChat"),
      handle: "sunny",
      extra: tText("北京 朝阳", "Beijing, Chaoyang", "北京 朝陽", "Peking, Chaoyang"),
      desc: tText("扫描二维码添加微信，欢迎交流与反馈", "Scan QR code to connect on WeChat", "QRコードをスキャンしてWeChatで連絡", "QR-Code scannen, um über WeChat zu verbinden"),
      img: wechatImg,
      color: "from-emerald-500/10 to-emerald-500/5",
      badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      badgeText: tText("个人微信", "WeChat Contact", "個人WeChat", "WeChat Kontakt"),
    },
    {
      id: "telegram",
      name: "Telegram",
      handle: "@SUNNY744",
      extra: "@SUNNY744",
      desc: tText("扫描二维码或搜索用户名 @SUNNY744 联系", "Scan QR code or search @SUNNY744 on Telegram", "QRコードまたは@SUNNY744で検索して連絡", "QR-Code scannen oder nach @SUNNY744 auf Telegram suchen"),
      img: telegramImg,
      color: "from-sky-500/10 to-sky-500/5",
      badgeColor: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
      badgeText: tText("TG 个人号", "Personal TG", "個人Telegram", "Persönliches TG"),
    },
    {
      id: "whatsapp",
      name: "WhatsApp",
      handle: "sunny",
      extra: tText("WhatsApp 联系人", "WhatsApp Contact", "WhatsApp 連絡先", "WhatsApp Kontakt"),
      desc: tText("扫描二维码添加 WhatsApp 联系人", "Scan QR code to connect on WhatsApp", "QRコードをスキャンしてWhatsAppで連絡", "QR-Code scannen, um über WhatsApp zu verbinden"),
      img: whatsappImg,
      color: "from-teal-500/10 to-teal-500/5",
      badgeColor: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
      badgeText: "WhatsApp",
    },
    {
      id: "line",
      name: "LINE",
      handle: "LINE",
      extra: "LINE Contact",
      desc: tText("扫描二维码添加 LINE 好友", "Scan QR code to add on LINE", "QRコードをスキャンしてLINE友だち追加", "QR-Code scannen, um auf LINE hinzuzufügen"),
      img: lineImg,
      color: "from-green-500/10 to-green-500/5",
      badgeColor: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
      badgeText: "LINE",
    },
  ];

  const currentList = activeCategory === "community" ? communityGroups : personalContacts;
  const filteredList =
    subFilter === "all" ? currentList : currentList.filter((item) => item.id === subFilter);

  return (
    <>
      {/* Centered Lightbox Modal for Zooming Images */}
      {zoomedItem && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 cursor-pointer"
          onClick={() => setZoomedItem(null)}
        >
          <div
            className="relative max-w-sm w-full bg-white dark:bg-[#121c18] border border-slate-200 dark:border-emerald-500/30 rounded-2xl p-6 shadow-2xl flex flex-col items-center cursor-default animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomedItem(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-emerald-300 hover:bg-slate-100 dark:hover:bg-emerald-950/40 transition cursor-pointer"
              aria-label="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              {zoomedItem.name}
            </h3>
            <div className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 mb-4">
              {zoomedItem.handle}
            </div>

            <div className="w-64 h-64 sm:w-72 sm:h-72 p-3 rounded-xl bg-white shadow-md flex items-center justify-center border border-slate-200">
              <img
                src={zoomedItem.src}
                alt={zoomedItem.name}
                className="w-full h-full object-contain rounded-lg select-none"
              />
            </div>

            <p className="mt-4 text-xs text-center text-slate-500 dark:text-emerald-400/80 leading-relaxed">
              {zoomedItem.desc}
            </p>
            <span className="mt-2 text-[11px] text-slate-400 dark:text-emerald-500/50">
              {tText(
                "点击任意空白区域关闭大图",
                "Click outside to close preview",
                "余白をクリックして閉じる",
                "Klicken Sie auf den Hintergrund, um die Vorschau zu schließen"
              )}
            </span>
          </div>
        </div>
      )}

      {/* Main Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="relative w-full max-w-3xl bg-theme-card border border-theme-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-5 bg-gradient-to-r from-emerald-500/10 via-sky-500/10 to-transparent border-b border-theme-subtle flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-xs ${
                  activeCategory === "community"
                    ? "bg-blue-500/15 border-blue-500/30 text-blue-500"
                    : "bg-emerald-500/15 border-emerald-500/30 text-emerald-500"
                }`}
              >
                {activeCategory === "community" ? (
                  <Users className="w-5 h-5" />
                ) : (
                  <MessageSquare className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-theme-primary tracking-tight">
                    {activeCategory === "community"
                      ? tText(
                          "官方技术交流群",
                          "Official Communities",
                          "公式コミュニティ (グループ)",
                          "Offizielle Community-Gruppen"
                        )
                      : tText(
                          "联系作者 / 交流合作",
                          "Contact Developer",
                          "開発者へ連絡 / フィードバック",
                          "Entwickler kontaktieren"
                        )}
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Sparkles className="w-3 h-3" />
                    {tText("欢迎交流探讨", "Welcome to Connect", "お気軽に参加・ご連絡ください", "Willkommen")}
                  </span>
                </div>
                <p className="text-xs text-theme-secondary mt-0.5">
                  {activeCategory === "community"
                    ? tText(
                        "欢迎加入官方技术交流群，共同探讨 Agent、自动化工作流与实践经验！",
                        "Welcome to join official discussion groups to explore Agent workflows & automation!",
                        "公式コミュニティに参加して、Agentと自動化ワークフローを共に探求しましょう！",
                        "Treten Sie den offiziellen Diskussionsgruppen bei, um Agenten-Workflows zu diskutieren!"
                      )
                    : tText(
                        "欢迎随时联系与交流，分享技术想法、反馈使用建议或探讨深度合作！",
                        "Welcome to get in touch, exchange ideas, share feedback, or explore technical collaboration!",
                        "技術的なアイデアの共有やご意見・ご相談はお気軽にご連絡ください！",
                        "Kontaktieren Sie uns gerne für Ideen, Feedback oder Kooperationen!"
                      )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card-muted transition cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Primary Top Category Switcher: 群组 vs 联系方式 彻底分开 */}
          <div className="px-6 py-3 bg-theme-card-muted/50 border-b border-theme-subtle flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 bg-theme-card p-1 rounded-xl border border-theme-subtle">
              <button
                type="button"
                onClick={() => {
                  setActiveCategory("community");
                  setSubFilter("all");
                }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeCategory === "community"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-muted"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>
                  {tText(
                    "官方交流群 (QQ / TG)",
                    "Community Groups",
                    "公式コミュニティ (QQ / TG)",
                    "Community-Gruppen"
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveCategory("contact");
                  setSubFilter("all");
                }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeCategory === "contact"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-muted"
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>
                  {tText(
                    "联系作者 (微信 / TG / WA / LINE)",
                    "Contact Developer",
                    "開発者へ連絡 (WeChat / TG / WA / LINE)",
                    "Kontakt aufnehmen"
                  )}
                </span>
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-1 text-[11px] text-theme-muted">
              <ZoomIn className="w-3 h-3 text-emerald-500" />
              <span>
                {tText(
                  "点击二维码图片可居中放大",
                  "Click QR code to enlarge",
                  "QRコードをクリックして拡大",
                  "Klicken Sie auf den QR-Code zum Vergrößern"
                )}
              </span>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="p-6 overflow-y-auto">
            <div
              className={`grid gap-4 ${
                activeCategory === "community"
                  ? "grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto"
                  : "grid-cols-1 sm:grid-cols-2"
              }`}
            >
              {filteredList.map((c) => (
                <div
                  key={c.id}
                  onClick={() =>
                    setZoomedItem({
                      src: c.img,
                      name: c.name,
                      handle: c.handle,
                      desc: c.desc,
                    })
                  }
                  className="group relative p-4 rounded-xl border border-theme-subtle bg-gradient-to-b from-theme-card to-theme-card-muted/50 hover:border-emerald-500/40 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col items-center text-center space-y-3"
                >
                  <div className="w-full flex items-center justify-between">
                    <span className="text-xs font-bold text-theme-primary">{c.name}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${c.badgeColor}`}
                    >
                      {c.badgeText || c.handle}
                    </span>
                  </div>

                  <div className="relative w-44 h-44 sm:w-48 sm:h-48 p-2 rounded-xl bg-white shadow-xs border border-slate-200 flex items-center justify-center group-hover:scale-[1.02] transition-transform duration-200">
                    <img
                      src={c.img}
                      alt={c.name}
                      className="w-full h-full object-contain rounded-lg select-none"
                    />
                    <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-1 backdrop-blur-xs">
                      <ZoomIn className="w-5 h-5 text-emerald-400" />
                      <span className="text-[11px] font-medium">
                        {tText(
                          "点击居中放大",
                          "Click to Enlarge",
                          "クリックして拡大",
                          "Vergrößern"
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-0.5 w-full">
                    <div className="text-xs font-mono font-semibold text-theme-primary">
                      {c.extra || c.handle}
                    </div>
                    <p className="text-[11px] text-theme-secondary line-clamp-2 leading-relaxed">
                      {c.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Bar */}
          <div className="px-6 py-3 bg-theme-card-muted border-t border-theme-subtle flex items-center justify-between text-xs text-theme-muted">
            <span>
              {tText(
                "点击任意卡片可在中心放大预览，点击外部空白处一键关闭。",
                "Click any card to enlarge, click outside to close.",
                "カードをクリックして拡大表示、余白をクリックして閉じます。",
                "Klicken Sie auf eine Karte zum Vergrößern, außerhalb zum Schließen."
              )}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-xs transition cursor-pointer"
            >
              {tText("关闭", "Close", "閉じる", "Schließen")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export const SponsorModal: React.FC<SponsorModalProps> = ContactModal;

