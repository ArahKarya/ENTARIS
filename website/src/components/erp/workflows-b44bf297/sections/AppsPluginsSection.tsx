"use client";

import { useEffect, useRef } from "react";
import { MiniFlow, PLUGIN_LOGOS, SectionEyebrow } from "./MiniFlow";
import { PLUGIN_FILTERS, PLUGINS } from "./pluginData";
import { PROCESSES } from "./processData";

/**
 * Port of workflow-motion.js initPluginBrowser(): a `[data-wf-plugin-filter]` click shows the
 * `[data-wf-plugin]` cards of that category (`hidden` on the rest; "All" shows every card),
 * sets aria-pressed on the filters and writes the visible count into `[data-wf-plugin-count]`.
 */
function usePluginBrowser(ref: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const browser = ref.current;
    if (!browser) return;
    browser.dataset.wfInitialized = "true";
    const filters = Array.from(browser.querySelectorAll<HTMLButtonElement>("[data-wf-plugin-filter]"));
    const plugins = Array.from(browser.querySelectorAll<HTMLElement>("[data-wf-plugin]"));
    const count = browser.querySelector<HTMLElement>("[data-wf-plugin-count]");

    const applyFilter = (category: string) => {
      let visibleCount = 0;
      plugins.forEach((plugin) => {
        const visible = category === "All" || plugin.dataset.category === category;
        plugin.hidden = !visible;
        if (visible) visibleCount += 1;
      });
      filters.forEach((filter) => {
        filter.setAttribute("aria-pressed", String(filter.dataset.wfPluginFilter === category));
      });
      if (count) count.textContent = String(visibleCount);
    };

    const offs = filters.map((filter) => {
      const onClick = () => applyFilter(filter.dataset.wfPluginFilter || "All");
      filter.addEventListener("click", onClick);
      return () => filter.removeEventListener("click", onClick);
    });
    return () => {
      offs.forEach((off) => off());
      delete browser.dataset.wfInitialized;
    };
  }, [ref]);
}

function AppGrid() {
  return (
    <div className="wf-app-grid">
      {PROCESSES.map((process) => (
        <article key={process.id}>
          <span>{process.area}</span>
          <h3>{process.system}</h3>
          <p>{process.title}</p>
          <MiniFlow variant="card" label={`${process.title} overview`} nodes={process.nodes} />
          <ul>
            {process.plugins.map((plugin) => (
              <li key={plugin.logo}>
                <svg className="wf-plugin-chip__mark" aria-hidden="true">
                  <use href={`${PLUGIN_LOGOS}#${plugin.logo}`} />
                </svg>
                <span>{plugin.name}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function PluginBrowser() {
  const ref = useRef<HTMLDivElement>(null);
  usePluginBrowser(ref);
  return (
    <div ref={ref} className="wf-plugin-browser" data-wf-plugin-browser="">
      <div className="wf-plugin-browser__head">
        <div>
          <span>Proto registry snapshot</span>
          <strong>
            <span data-wf-plugin-count="">{PLUGINS.length}</span> Plugins shown
          </strong>
        </div>
        <div className="wf-plugin-filters" aria-label="Filter Plugins by category">
          {PLUGIN_FILTERS.map((filter) => (
            <button key={filter} type="button" data-wf-plugin-filter={filter} aria-pressed={filter === "All" ? "true" : "false"}>
              {filter}
            </button>
          ))}
        </div>
      </div>
      <ul className="wf-plugin-grid">
        {PLUGINS.map((plugin) => (
          <li key={plugin.logo} data-wf-plugin="" data-category={plugin.category}>
            <span className="wf-plugin-logo">
              <svg className="wf-plugin-logo__mark" role="img" aria-label={plugin.logoLabel}>
                <use href={`${PLUGIN_LOGOS}#${plugin.logo}`} />
              </svg>
            </span>
            <strong>{plugin.name}</strong>
            <small>{plugin.group}</small>
          </li>
        ))}
      </ul>
      <p>
        Listed does not mean configured. Each workspace still completes the provider setup and receives only the
        actions its permissions allow.
      </p>
    </div>
  );
}

/** m03 — `#apps-plugins`: app cards with mini flows + the filterable Plugin registry. */
export function AppsPluginsSection() {
  return (
    <section id="apps-plugins" className="wf-section wf-section--soft">
      <div className="wf-shell">
        <SectionEyebrow name="Apps and Plugins" context="Source-backed inventory" />
        <div className="wf-section-head wf-section-head--split">
          <h2>Start in an ERP.AI app. Reach the systems around it.</h2>
          <p>
            ERP.AI supplies the business record and workflow. Memory and GNN give agents cited context; Proto Plugins
            expose approved actions in the other systems the process needs.
          </p>
        </div>
        <AppGrid />
        <PluginBrowser />
      </div>
    </section>
  );
}
