"use client";

interface Props {
  active: string;
  onGenerate?: () => void;
  generating?: boolean;
}

const ITEMS = [
  { href: "/",          label: "ホーム",  icon: "🏠" },
  { href: "/history",   label: "一覧",    icon: "📋" },
  { href: "/assets",    label: "資産",    icon: "📊" },
  { href: "/portfolio", label: "管理",    icon: "⚙️" },
];

export default function MobileNav({ active, onGenerate, generating }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-white border-t border-slate-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="grid grid-cols-5 h-[60px]">
        {ITEMS.slice(0, 2).map(item => (
          <a
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 active:bg-slate-50 transition-colors ${
              active === item.href ? "text-[#008b8b]" : "text-slate-400"
            }`}
          >
            <span className="text-[1.3rem] leading-none">{item.icon}</span>
            <span className="text-[0.6rem] font-medium">{item.label}</span>
          </a>
        ))}

        {/* Center: Generate */}
        <div className="flex items-center justify-center">
          {onGenerate ? (
            <button
              onClick={onGenerate}
              disabled={generating}
              className="flex flex-col items-center justify-center w-[52px] h-[46px] bg-[#008b8b] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl transition-colors shadow-md"
            >
              <span className="text-[1rem] leading-none">{generating ? "…" : "▶"}</span>
              <span className="text-[0.55rem] font-semibold mt-0.5">生成</span>
            </button>
          ) : (
            <a
              href="/"
              className="flex flex-col items-center justify-center w-[52px] h-[46px] bg-[#008b8b] text-white rounded-2xl shadow-md"
            >
              <span className="text-[1rem] leading-none">▶</span>
              <span className="text-[0.55rem] font-semibold mt-0.5">生成</span>
            </a>
          )}
        </div>

        {ITEMS.slice(2).map(item => (
          <a
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 active:bg-slate-50 transition-colors ${
              active === item.href ? "text-[#008b8b]" : "text-slate-400"
            }`}
          >
            <span className="text-[1.3rem] leading-none">{item.icon}</span>
            <span className="text-[0.6rem] font-medium">{item.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
