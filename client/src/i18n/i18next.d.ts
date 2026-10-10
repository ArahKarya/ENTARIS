/** Type-safe keys: Indonesian files are the source of truth for key names. */
import 'i18next';
import type common from '../locales/id/common.json';
import type shell from '../locales/id/shell.json';
import type auth from '../locales/id/auth.json';
import type settings from '../locales/id/settings.json';
import type sales from '../locales/id/sales.json';
import type purchasing from '../locales/id/purchasing.json';
import type inventory from '../locales/id/inventory.json';
import type production from '../locales/id/production.json';
import type finance from '../locales/id/finance.json';
import type reports from '../locales/id/reports.json';
import type eam from '../locales/id/eam.json';
import type dashboard from '../locales/id/dashboard.json';
import type approvals from '../locales/id/approvals.json';
import type aira from '../locales/id/aira.json';
import type pdf from '../locales/id/pdf.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      shell: typeof shell;
      auth: typeof auth;
      settings: typeof settings;
      sales: typeof sales;
      purchasing: typeof purchasing;
      inventory: typeof inventory;
      production: typeof production;
      finance: typeof finance;
      reports: typeof reports;
      eam: typeof eam;
      dashboard: typeof dashboard;
      approvals: typeof approvals;
      aira: typeof aira;
      pdf: typeof pdf;
    };
  }
}
