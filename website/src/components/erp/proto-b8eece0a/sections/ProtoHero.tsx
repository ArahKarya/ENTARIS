import { ArrowRightIcon, ProtoEyebrow } from "./ProtoEyebrow";

const ASSETS = "/assets/assets";
const RELEASES = "https://github.com/erphq/proto-releases/releases";

type DownloadOption = {
  platform: "macos" | "windows" | "linux";
  name: string;
  file: string;
  label: string;
  headline: string;
  meta: string;
  /** Server-rendered state (macOS is the captured platform); useDownloadPicker recomputes it. */
  hidden: boolean;
};

const DOWNLOAD_OPTIONS: readonly DownloadOption[] = [
  {
    platform: "macos",
    name: "macOS",
    file: "Proto-aarch64.dmg",
    label: "Download Proto for macOS",
    headline: "Install Proto on your Mac.",
    meta: "macOS arm64 / M1+ / macOS 12+ / signed and notarized / free during alpha",
    hidden: true,
  },
  {
    platform: "windows",
    name: "Windows",
    file: "Proto-x64-setup.exe",
    label: "Download Proto for Windows",
    headline: "Install Proto on Windows.",
    meta: "Windows x64 / Windows 11 / installer exe / free during alpha",
    hidden: false,
  },
  {
    platform: "linux",
    name: "Linux",
    file: "Proto-x86_64.AppImage",
    label: "Download Proto for Linux",
    headline: "Install Proto on Linux.",
    meta: "Linux x86_64 / AppImage / free during alpha",
    hidden: false,
  },
];

const downloadUrl = (file: string): string => `${RELEASES}/latest/download/${file}`;

function DownloadPicker() {
  return (
    <div className="tacet-proto-actions" data-download-picker="" data-current-platform="macos" data-download-fallback-url={RELEASES} data-download-fallback-label="Download Proto">
      <a href={downloadUrl("Proto-aarch64.dmg")} className="btn btn--primary btn--xl" data-download-primary="" data-platform="macos" aria-label="Download Proto for macOS">
        <span data-download-primary-label="">Download Proto for macOS</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-download ui-icon" data-icon="download" aria-hidden="true" focusable="false">
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
          <path d="M7 11l5 5l5 -5" />
          <path d="M12 4l0 12" />
        </svg>
      </a>
      <a href="#case-files" className="btn btn--ghost btn--xl">
        <span>See Proto at work</span>
        <ArrowRightIcon />
      </a>
      <div className="download-menu download-menu--hero" data-download-menu="" data-download-menu-bound="true">
        <button className="download-menu__trigger" type="button" aria-haspopup="menu" aria-expanded="false" data-download-menu-trigger="">
          <span data-download-menu-label="">Other platforms</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="icon icon-tabler icons-tabler-filled icon-tabler-caret-down download-menu__caret" data-icon="caret-down-filled" aria-hidden="true" focusable="false">
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M18 9c.852 0 1.297 .986 .783 1.623l-.076 .084l-6 6a1 1 0 0 1 -1.32 .083l-.094 -.083l-6 -6l-.083 -.094l-.054 -.077l-.054 -.096l-.017 -.036l-.027 -.067l-.032 -.108l-.01 -.053l-.01 -.06l-.004 -.057v-.118l.005 -.058l.009 -.06l.01 -.052l.032 -.108l.027 -.067l.07 -.132l.065 -.09l.073 -.081l.094 -.083l.077 -.054l.096 -.054l.036 -.017l.067 -.027l.108 -.032l.053 -.01l.06 -.01l.057 -.004l12.059 -.002z" />
          </svg>
        </button>
        <div className="download-menu__panel" role="menu" data-download-menu-panel="">
          {DOWNLOAD_OPTIONS.map((option) => (
            <a key={option.platform} href={downloadUrl(option.file)} className="download-menu__item" role="menuitem" data-download-option="" data-platform={option.platform} data-label={option.label} data-headline={option.headline} data-meta={option.meta} hidden={option.hidden}>
              <span className="download-menu__name">{option.name}</span>
              <span className="download-menu__meta">{option.meta}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/** m00 — hero: copy, OS-aware download picker, looping desktop video. */
export function ProtoHero() {
  return (
    <header className="erpai-hero tacet-proto-hero" aria-labelledby="proto-hero-title">
      <div className="tacet-proto-wrap tacet-proto-hero__grid">
        <div className="tacet-proto-hero__story">
          <ProtoEyebrow name="Proto" context="Agent harness for business processes" />
          <h1 id="proto-hero-title">An agent harness for your business processes.</h1>
        </div>
        <div className="tacet-proto-hero__summary">
          <p className="tacet-proto-hero__lede">
            Proto turns your data, rules, approvals, and actions into versioned internal apps agents can run. You review every change before release.
          </p>
          <DownloadPicker />
        </div>
        <aside className="tacet-proto-console tacet-proto-motion tacet-proto-motion--hero" data-proto-motion="" aria-label="Current Proto desktop interface building an internal business app">
          <div className="tacet-proto-motion__frame">
            <video muted loop playsInline preload="auto" poster={`${ASSETS}/images/proto/proto-desktop-session.webp`}>
              <source src={`${ASSETS}/videos/proto/invoice-tracker.webm`} type="video/webm" />
              <source src={`${ASSETS}/videos/proto/invoice-tracker.mp4`} type="video/mp4" />
            </video>
            <button type="button" className="tacet-proto-motion__toggle" data-proto-motion-toggle="" aria-label="Play video">
              Play
            </button>
          </div>
        </aside>
      </div>
    </header>
  );
}
