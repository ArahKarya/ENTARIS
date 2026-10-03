/** Data for the three sticky story sections (m03 #apps, m04 #case-files, m05 #approval). */

export type StoryChapter = {
  /** `data-position` — fraction of the video duration the chapter seeks to. */
  position: string;
  title: string;
  text: string;
};

export type Story = {
  sectionId: string;
  sectionClassName: string;
  side: "media-right" | "media-left";
  titleId: string;
  eyebrowName: string;
  eyebrowContext: string;
  title: string;
  lede: string;
  chapters: readonly [StoryChapter, StoryChapter, StoryChapter];
  /** `tacet-proto-story__media--<mediaKey>` */
  mediaKey: string;
  /** `proto-<stageKey>-stage-sketch-v1(.webp|-960.webp)` */
  stageKey: string;
  poster: string;
  /** `videos/proto/<videoKey>.webm|mp4` */
  videoKey: string;
};

export const STORIES: readonly Story[] = [
  {
    sectionId: "apps",
    sectionClassName: "tacet-proto-section tacet-proto-section--framed",
    side: "media-right",
    titleId: "finance-app-title",
    eyebrowName: "Finance",
    eyebrowContext: "Invoice exceptions",
    title: "Build the system around the exception.",
    lede: "Track aging, disputes, owners, next actions, and approval in one finance workflow.",
    chapters: [
      { position: "0.04", title: "Describe the process", text: "Aging, dispute reasons, owners, next actions, and approval." },
      { position: "0.52", title: "Watch Proto build", text: "A branch, table, fields, dashboard, and review view are staged." },
      { position: "0.84", title: "Review the app", text: "The proposed structure is visible before anything is released." },
    ],
    mediaKey: "finance-app",
    stageKey: "finance",
    poster: "proto-invoice-session.webp",
    videoKey: "invoice-tracker-chat",
  },
  {
    sectionId: "case-files",
    sectionClassName: "tacet-proto-section tacet-proto-section--darker",
    side: "media-left",
    titleId: "support-app-title",
    eyebrowName: "Support",
    eyebrowContext: "SLA triage",
    title: "Give every queue a working escalation path.",
    lede: "Turn priority, SLA risk, ownership, and article handoff into one support workflow.",
    chapters: [
      { position: "0.04", title: "Name the queue", text: "Priority, SLA risk, escalation ownership, and article handoff." },
      { position: "0.52", title: "Build the workflow", text: "Proto stages the ticket table, owner fields, risk view, and trigger." },
      { position: "0.84", title: "Keep the handoff", text: "The resulting queue and escalation path stay in one business app." },
    ],
    mediaKey: "support-app",
    stageKey: "support",
    poster: "proto-support-session.webp",
    videoKey: "support-triage-chat",
  },
  {
    sectionId: "approval",
    sectionClassName: "tacet-proto-section",
    side: "media-right",
    titleId: "approval-app-title",
    eyebrowName: "People",
    eyebrowContext: "Leave approval",
    title: "Keep the decision and its release history together.",
    lede: "Map coverage checks, manager approval, HR review, and the final release in one controlled flow.",
    chapters: [
      { position: "0.04", title: "Map the decision", text: "Coverage checks, manager approval, HR review, and history." },
      { position: "0.52", title: "Stage the route", text: "Proto builds the request table, decision fields, and approval flow." },
      { position: "0.84", title: "Approve the release", text: "Branch history stays visible and the final action stays with you." },
    ],
    mediaKey: "approval-app",
    stageKey: "approval",
    poster: "proto-leave-session.webp",
    videoKey: "leave-approval-chat",
  },
];
