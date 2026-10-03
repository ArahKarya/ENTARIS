import type { PluginEntry } from "./types";

/** `[data-wf-plugin-filter]` values, in source order. */
export const PLUGIN_FILTERS: readonly string[] = ["All", "Communication", "Productivity", "Files", "Work management", "Data", "Customer", "Commerce", "Finance", "Developer"];

/**
 * Proto registry snapshot (`[data-wf-plugin]`), in source order. `logoLabel` and `group` are kept
 * verbatim even where they differ from the name/category on the source.
 */
export const PLUGINS: readonly PluginEntry[] = [
  { category: "Communication", logo: "plugin-gmail", logoLabel: "Gmail logo", name: "Gmail", group: "Communication" },
  { category: "Productivity", logo: "plugin-google-calendar", logoLabel: "Google Calendar logo", name: "Google Calendar", group: "Productivity" },
  { category: "Productivity", logo: "plugin-google-sheets", logoLabel: "Google Sheets logo", name: "Google Sheets", group: "Productivity" },
  { category: "Productivity", logo: "plugin-google-docs", logoLabel: "Google Docs logo", name: "Google Docs", group: "Productivity" },
  { category: "Files", logo: "plugin-google-drive", logoLabel: "Google Drive logo", name: "Google Drive", group: "Files" },
  { category: "Communication", logo: "plugin-microsoft-outlook", logoLabel: "Microsoft Outlook logo", name: "Microsoft Outlook", group: "Communication" },
  { category: "Communication", logo: "plugin-microsoft-teams", logoLabel: "Microsoft Teams logo", name: "Microsoft Teams", group: "Communication" },
  { category: "Files", logo: "plugin-onedrive", logoLabel: "OneDrive logo", name: "OneDrive", group: "Files" },
  { category: "Communication", logo: "plugin-slack", logoLabel: "Slack logo", name: "Slack", group: "Communication" },
  { category: "Communication", logo: "plugin-zoom", logoLabel: "Zoom logo", name: "Zoom", group: "Communication" },
  { category: "Productivity", logo: "plugin-notion", logoLabel: "Notion logo", name: "Notion", group: "Productivity" },
  { category: "Productivity", logo: "plugin-todoist", logoLabel: "Todoist logo", name: "Todoist", group: "Productivity" },
  { category: "Work management", logo: "plugin-asana", logoLabel: "Asana logo", name: "Asana", group: "Work management" },
  { category: "Work management", logo: "plugin-trello", logoLabel: "Trello logo", name: "Trello", group: "Work management" },
  { category: "Work management", logo: "plugin-monday-com", logoLabel: "Monday.com logo", name: "Monday.com", group: "Work management" },
  { category: "Data", logo: "plugin-airtable", logoLabel: "Airtable logo", name: "Airtable", group: "Data" },
  { category: "Customer", logo: "plugin-hubspot", logoLabel: "HubSpot logo", name: "HubSpot", group: "Customer" },
  { category: "Customer", logo: "plugin-salesforce", logoLabel: "Salesforce logo", name: "Salesforce", group: "Customer" },
  { category: "Customer", logo: "plugin-zendesk", logoLabel: "Zendesk logo", name: "Zendesk", group: "Customer" },
  { category: "Commerce", logo: "plugin-shopify", logoLabel: "Shopify logo", name: "Shopify", group: "Commerce" },
  { category: "Finance", logo: "plugin-stripe", logoLabel: "Stripe logo", name: "Stripe", group: "Finance" },
  { category: "Finance", logo: "plugin-quickbooks", logoLabel: "QuickBooks logo", name: "QuickBooks", group: "Finance" },
  { category: "Files", logo: "plugin-dropbox", logoLabel: "Dropbox logo", name: "Dropbox", group: "Files" },
  { category: "Work management", logo: "plugin-linear", logoLabel: "Linear logo", name: "Linear", group: "Work management" },
  { category: "Work management", logo: "plugin-atlassian-jira-confluence", logoLabel: "Atlassian (Jira & Confluence) logo", name: "Atlassian (Jira & Confluence)", group: "Work management" },
  { category: "Developer", logo: "plugin-github", logoLabel: "GitHub logo", name: "GitHub", group: "Developer" },
  { category: "Developer", logo: "plugin-gitlab", logoLabel: "GitLab logo", name: "GitLab", group: "Developer" },
  { category: "Productivity", logo: "plugin-granola", logoLabel: "Granola logo", name: "Granola", group: "Productivity" },
  { category: "Productivity", logo: "plugin-figma", logoLabel: "Figma logo", name: "Figma", group: "Productivity" },
  { category: "Developer", logo: "plugin-sentry", logoLabel: "Sentry logo", name: "Sentry", group: "Developer" },
  { category: "Customer", logo: "plugin-intercom", logoLabel: "Intercom logo", name: "Intercom", group: "Customer" },
  { category: "Developer", logo: "plugin-webflow", logoLabel: "Webflow logo", name: "Webflow", group: "Developer" },
  { category: "Productivity", logo: "plugin-canva", logoLabel: "Canva logo", name: "Canva", group: "Productivity" },
  { category: "Finance", logo: "plugin-paypal", logoLabel: "PayPal logo", name: "PayPal", group: "Finance" },
  { category: "Finance", logo: "plugin-square", logoLabel: "Square logo", name: "Square", group: "Finance" },
  { category: "Developer", logo: "plugin-vercel", logoLabel: "Vercel logo", name: "Vercel", group: "Developer" },
  { category: "Productivity", logo: "plugin-zapier", logoLabel: "Zapier logo", name: "Zapier", group: "Productivity" },
  { category: "Data", logo: "plugin-neon-postgres", logoLabel: "Neon Postgres logo", name: "Neon Postgres", group: "Data" },
  { category: "Developer", logo: "plugin-cloudflare-observability", logoLabel: "Cloudflare Observability logo", name: "Cloudflare Observability", group: "Developer" },
];
