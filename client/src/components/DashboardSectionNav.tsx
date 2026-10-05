import { useEffect, useRef, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';

import { tabId } from './dashboardTabId';

export interface SectionDef {
  id: string;
  label: string;
  icon: React.ElementType;
}

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
      className="sticky top-0 z-20 -mx-3 border-b border-border bg-background/90 px-3 backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6"
    >
      {/* Anchor-scroll nav rendered with the shared Tabs (underline). Manual activation:
          arrow keys move focus, Enter/Space scrolls to the section. */}
      <Tabs value={active} onValueChange={handleClick} activationMode="manual">
        <TabsList variant="underline" aria-label="Bagian dasbor" className="no-scrollbar h-11 gap-5 border-b-0 sm:h-10">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <TabsTrigger
                key={s.id}
                value={s.id}
                id={tabId(s.id)}
                aria-controls={s.id}
                className="h-11 shrink-0 rounded-sm sm:h-10"
              >
                <Icon size={14} aria-hidden />
                {s.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </nav>
  );
}
