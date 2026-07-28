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
    <div
      className="sticky top-0 z-20 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 py-2 border-b backdrop-blur"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-bg-secondary) 92%, transparent)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {sections.map((s) => {
          const Icon = s.icon;
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              onClick={() => handleClick(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              style={
                isActive
                  ? undefined
                  : {
                      color: 'var(--color-text-secondary)',
                      borderColor: 'var(--color-border)',
                      backgroundColor: 'var(--color-bg-primary)',
                    }
              }
            >
              <Icon size={13} />
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
