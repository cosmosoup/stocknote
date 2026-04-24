"use client";

interface Props {
  active: string;
  onGenerate?: () => void;
  generating?: boolean;
}

/* ── Flat SVG Icons ── */
const HomeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const ListIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/>
    <line x1="8" y1="12" x2="21" y2="12"/>
    <line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/>
    <line x1="3" y1="12" x2="3.01" y2="12"/>
    <line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);

const ChartIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
    <line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);

const SlidersIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14"/>
    <line x1="4" y1="10" x2="4" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12" y2="3"/>
    <line x1="20" y1="21" x2="20" y2="16"/>
    <line x1="20" y1="12" x2="20" y2="3"/>
    <line x1="1" y1="14" x2="7" y2="14"/>
    <line x1="9" y1="8" x2="15" y2="8"/>
    <line x1="17" y1="16" x2="23" y2="16"/>
  </svg>
);

const GenerateIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="12" y1="18" x2="12" y2="12"/>
    <line x1="9" y1="15" x2="15" y2="15"/>
  </svg>
);

const NAV_ITEMS = [
  { href: "/",          label: "ホーム", Icon: HomeIcon },
  { href: "/history",   label: "一覧",   Icon: ListIcon },
  { href: "/assets",    label: "資産",   Icon: ChartIcon },
  { href: "/portfolio", label: "管理",   Icon: SlidersIcon },
];

export default function MobileNav({ active, onGenerate, generating }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-white border-t border-slate-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="grid grid-cols-5 h-[68px]">
        {/* ホーム・一覧・資産・管理 */}
        {NAV_ITEMS.map(({ href, label, Icon }) => (
          <a
            key={href}
            href={href}
            className={`flex flex-col items-center justify-center gap-1 active:bg-slate-50 transition-colors ${
              active === href ? "text-[#008b8b]" : "text-slate-400"
            }`}
          >
            <Icon />
            <span className="text-[0.6rem] font-medium">{label}</span>
          </a>
        ))}

        {/* 生成 ── 一番右、アクションボタンスタイル */}
        <div className="flex items-center justify-center">
          {onGenerate ? (
            <button
              onClick={onGenerate}
              disabled={generating}
              className="flex flex-col items-center justify-center gap-1 w-[54px] h-[52px] bg-[#008b8b] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl transition-colors shadow-sm"
            >
              {generating
                ? <span className="text-sm leading-none">…</span>
                : <GenerateIcon />
              }
              <span className="text-[0.6rem] font-semibold">生成</span>
            </button>
          ) : (
            <a
              href="/"
              className="flex flex-col items-center justify-center gap-1 w-[54px] h-[52px] bg-[#008b8b] text-white rounded-xl shadow-sm"
            >
              <GenerateIcon />
              <span className="text-[0.6rem] font-semibold">生成</span>
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
