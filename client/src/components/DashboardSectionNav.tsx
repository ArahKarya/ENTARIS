import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, DollarSign, TrendingUp, Package, Factory } from 'lucide-react';

export interface SectionDef {
  id: string;
  label: string;
  icon: React.ElementType;
}

export const DEFAULT_SECTIONS: SectionDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'keuangan', label: 'Keuangan', icon: DollarSign },
  { id: 'sales', label: 'Sales', icon: TrendingUp },
  { id: 'stok', label: 'Stok', icon: Package },
  { id: 'produksi', label: 'Produksi', icon: Factory },
];

interface DashboardSectionNavProps {
  sections: SectionDef[];
  scrollRootId?: string;
}

export default function DashboardSectionNav({ sections, scrollRootId = 'main-content' }: DashboardSectionNavProps) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? '');
  const clickedRef = useRef<string | null>(null);
  const clickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const root = document.getElementById(scrollRootId);
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (clickedRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          setActive(visible[0].target.id);
        }
      },
      {
        root,
        rootMargin: '-80px 0px -60% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections, scrollRootId]);

  const handleClick = (id: string) => {
    clickedRef.current = id;
    setActive(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickedRef.current = null;
    }, 800);
  };

  return (
    <nav
      aria-label="Bagian dasbor"
      className="sticky top-0 z-20 -mx-3 border-b border-border bg-background/90 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6"
    >
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
        {sections.map((s) => {
          const Icon = s.icon;
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => handleClick(s.id)}
              aria-current={isActive ? 'true' : undefined}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 sm:px-3 ${
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon size={13} aria-hidden />
              {s.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
