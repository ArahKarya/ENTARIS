import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api';
import { Tag, Clock, ExternalLink, RefreshCw, CheckCircle, ArrowUpCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SettingsCard } from '../../components/settings/SettingsCard';
import { APP_VERSION, APP_BUILD_DATE, APP_NAME, localizedChangelog } from '../../lib/version';

interface UpdateInfo {
  status: 'latest' | 'available' | 'error';
  remoteVersion?: string;
  remoteChangelog?: Array<{ version: string; date: string; title: string; changes: string[] }>;
  errorMsg?: string;
}

const GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/ArahKarya/entaris/main/client/src/lib/version.ts';

function parseRemoteVersion(source: string): { version: string; changelog: UpdateInfo['remoteChangelog'] } {
  const versionMatch = source.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  const version = versionMatch?.[1] || '';

  const changelog: UpdateInfo['remoteChangelog'] = [];
  const entryRegex = /\{\s*version:\s*'([^']+)',\s*date:\s*'([^']+)',\s*title:\s*'([^']+)',\s*changes:\s*\[([\s\S]*?)\],?\s*\}/g;
  let match;
  while ((match = entryRegex.exec(source)) !== null) {
    const changes = [...match[4].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    changelog.push({ version: match[1], date: match[2], title: match[3], changes });
  }

  return { version, changelog };
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

interface RuntimeInfo {
  platform: string;
  domain: string;
  hostname: string;
  nodeVersion: string;
  memory: string;
  uptime: number;
  env: string;
}

export const AboutTab: React.FC = () => {
  const { t, i18n } = useTranslation('settings');
  const changelog = localizedChangelog(i18n.language);
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);

  useEffect(() => {
    api.get('/settings/runtime').then(res => setRuntime(res.data)).catch(() => {
      setRuntime({ platform: '—', domain: window.location.origin, hostname: '—', nodeVersion: '—', memory: '—', uptime: 0, env: '—' });
    });
  }, []);

  const handleCheckUpdate = async () => {
    setChecking(true);
    setUpdateInfo(null);
    try {
      const res = await fetch(GITHUB_RAW_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const source = await res.text();
      const { version, changelog } = parseRemoteVersion(source);

      if (!version) throw new Error(t('about.readVersionError'));

      if (compareSemver(version, APP_VERSION) > 0) {
        const newEntries = changelog?.filter((e) => compareSemver(e.version, APP_VERSION) > 0) || [];
        setUpdateInfo({ status: 'available', remoteVersion: version, remoteChangelog: newEntries });
      } else {
        setUpdateInfo({ status: 'latest', remoteVersion: version });
      }
    } catch (err: any) {
      setUpdateInfo({ status: 'error', errorMsg: err?.message || t('about.checkError') });
    } finally {
      setChecking(false);
    }
  };

  const facts = [
    { icon: Tag, label: t('about.facts.version'), value: APP_VERSION, mono: true },
    { icon: Clock, label: t('about.facts.buildDate'), value: APP_BUILD_DATE },
    { icon: Info, label: t('about.facts.platform'), value: runtime?.platform || '…' },
    { icon: ExternalLink, label: t('about.facts.domain'), value: runtime?.domain || window.location.origin },
  ];

  return (
    <div className="space-y-5">
      <SettingsCard
        title={APP_NAME}
        description={t('about.tagline')}
        actions={<Badge variant="primary" className="font-mono text-sm">v{APP_VERSION}</Badge>}
        contentClassName="space-y-5"
      >
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0 rounded-lg bg-muted p-3">
              <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <f.icon className="size-3.5" aria-hidden /> {f.label}
              </dt>
              <dd className={cn('truncate text-sm font-semibold text-foreground', f.mono && 'font-mono')} title={f.value}>{f.value}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleCheckUpdate} loading={checking}>
              {!checking && <RefreshCw aria-hidden />} {checking ? t('about.checking') : t('about.checkUpdate')}
            </Button>
            <div aria-live="polite" className="text-xs">
              {updateInfo?.status === 'latest' && (
                <span className="flex items-center gap-1.5 font-medium text-success-text">
                  <CheckCircle className="size-4" aria-hidden /> {t('about.upToDate', { version: updateInfo.remoteVersion })}
                </span>
              )}
              {updateInfo?.status === 'error' && (
                <span className="flex items-center gap-1.5 font-medium text-danger-text">
                  <Info className="size-4" aria-hidden /> {updateInfo.errorMsg}
                </span>
              )}
            </div>
          </div>

          {updateInfo?.status === 'available' && (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary-subtle p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-primary-subtle-foreground">
                  <ArrowUpCircle className="size-4" aria-hidden /> {t('about.available', { version: updateInfo.remoteVersion })}
                </p>
                <Badge variant="outline" className="font-mono">v{APP_VERSION} → v{updateInfo.remoteVersion}</Badge>
              </div>
              {updateInfo.remoteChangelog && updateInfo.remoteChangelog.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground">{t('about.newChanges')}</p>
                  {updateInfo.remoteChangelog.map((entry) => (
                    <ChangelogEntry key={entry.version} entry={entry} highlight={false} />
                  ))}
                </div>
              )}
              <div className="space-y-1 rounded-lg bg-card p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">{t('about.howToUpdate')}</p>
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard focusable (axe scrollable-region-focusable) */}
                <pre className="overflow-x-auto rounded-md border border-border bg-surface-sunken p-2.5 font-mono text-xs text-foreground" tabIndex={0}>
{`cd ~/entaris
git pull origin main
docker compose up -d --build`}</pre>
              </div>
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('about.changelog')}
        actions={<Badge variant="info">{t('about.releases', { count: changelog.length })}</Badge>}
      >
        <ol className="relative space-y-3 border-l border-border pl-5">
          {changelog.map((entry, idx) => (
            <li key={entry.version} className="relative">
              <span
                aria-hidden
                className={cn(
                  'absolute -left-[25px] top-4 size-2.5 rounded-full ring-4 ring-card',
                  idx === 0 ? 'bg-primary' : 'bg-border-strong',
                )}
              />
              <ChangelogEntry entry={entry} highlight={idx === 0} />
            </li>
          ))}
        </ol>
      </SettingsCard>
    </div>
  );
};

interface ChangelogEntryProps {
  entry: { version: string; date: string; title: string; changes: string[] };
  highlight: boolean;
}

function ChangelogEntry({ entry, highlight }: ChangelogEntryProps) {
  return (
    <div className={cn('rounded-lg border bg-card p-4', highlight ? 'border-primary/40' : 'border-border')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant={highlight ? 'primary' : 'neutral'} className="font-mono">v{entry.version}</Badge>
          <h4 className="text-sm font-semibold text-foreground">{entry.title}</h4>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{entry.date}</span>
      </div>
      <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
        {entry.changes.map((change, ci) => <li key={ci}>{change}</li>)}
      </ul>
    </div>
  );
}
