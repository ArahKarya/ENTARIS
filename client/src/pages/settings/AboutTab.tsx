import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import {
  Tag, Clock, Sparkles, ExternalLink, RefreshCw, CheckCircle, ArrowUpCircle,
  Info, Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { APP_VERSION, APP_BUILD_DATE, APP_NAME, CHANGELOG } from '../../lib/version';

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
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);

  useEffect(() => {
    api.get('/settings/runtime').then(res => setRuntime(res.data)).catch(() => {
      setRuntime({ platform: '-', domain: window.location.origin, hostname: '-', nodeVersion: '-', memory: '-', uptime: 0, env: '-' });
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

      if (!version) throw new Error('Gagal membaca versi dari repository.');

      if (compareSemver(version, APP_VERSION) > 0) {
        const newEntries = changelog?.filter((e) => compareSemver(e.version, APP_VERSION) > 0) || [];
        setUpdateInfo({ status: 'available', remoteVersion: version, remoteChangelog: newEntries });
      } else {
        setUpdateInfo({ status: 'latest', remoteVersion: version });
      }
    } catch (err: any) {
      setUpdateInfo({ status: 'error', errorMsg: err?.message || 'Gagal memeriksa pembaruan.' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* App Info Card */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Sparkles size={22} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{APP_NAME}</h3>
                <p className="text-blue-100 text-xs">Sistem ERP & Operasional</p>
              </div>
            </div>
            <span className="bg-white/20 text-white text-sm font-mono font-bold px-3 py-1.5 rounded-lg">
              v{APP_VERSION}
            </span>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Tag size={12} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Versi</span>
              </div>
              <p className="text-sm font-bold text-gray-900 font-mono">{APP_VERSION}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={12} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Build Date</span>
              </div>
              <p className="text-sm font-bold text-gray-900">{APP_BUILD_DATE}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Info size={12} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Platform</span>
              </div>
              <p className="text-sm font-bold text-gray-900">{runtime?.platform || '...'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ExternalLink size={12} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Domain</span>
              </div>
              <p className="text-sm font-bold text-gray-900 truncate">{runtime?.domain || window.location.origin}</p>
            </div>
          </div>

          {/* Check for updates */}
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleCheckUpdate}
                disabled={checking}
                className="btn-secondary text-xs py-2"
              >
                {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {checking ? 'Memeriksa...' : 'Periksa Pembaruan'}
              </button>

              {updateInfo?.status === 'latest' && (
                <div className="flex items-center gap-1.5 text-xs text-green-600">
                  <CheckCircle size={14} />
                  <span className="font-medium">Aplikasi sudah versi terbaru (v{updateInfo.remoteVersion}).</span>
                </div>
              )}
              {updateInfo?.status === 'error' && (
                <div className="flex items-center gap-1.5 text-xs text-red-500">
                  <Info size={14} />
                  <span className="font-medium">{updateInfo.errorMsg}</span>
                </div>
              )}
            </div>

            {/* Update available card */}
            {updateInfo?.status === 'available' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowUpCircle size={16} className="text-blue-600" />
                    <span className="text-sm font-semibold text-blue-800">
                      Pembaruan tersedia: v{updateInfo.remoteVersion}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-blue-500 bg-blue-100 px-2 py-0.5 rounded">
                    v{APP_VERSION} → v{updateInfo.remoteVersion}
                  </span>
                </div>

                {/* New changes */}
                {updateInfo.remoteChangelog && updateInfo.remoteChangelog.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-blue-700">Perubahan baru:</p>
                    {updateInfo.remoteChangelog.map((entry) => (
                      <div key={entry.version} className="bg-white/60 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-mono text-xs font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                            v{entry.version}
                          </span>
                          <span className="text-xs font-medium text-gray-800">{entry.title}</span>
                          <span className="text-xs text-gray-400 font-mono ml-auto">{entry.date}</span>
                        </div>
                        <ul className="space-y-0.5">
                          {entry.changes.map((c, i) => (
                            <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                              <span className="text-blue-400 mt-0.5">•</span> {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-white/60 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                  <p className="font-semibold text-gray-700">Cara update di server:</p>
                  <pre className="bg-gray-900 text-green-300 rounded-lg p-2.5 text-xs font-mono overflow-x-auto">
{`cd ~/entaris
git pull origin main
docker compose up -d --build`}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Changelog */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-base font-semibold text-gray-900">Changelog</h2>
          <span className="badge badge-blue text-xs">{CHANGELOG.length} rilis</span>
        </div>

        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[17px] top-8 bottom-4 w-px bg-gray-200" />

          <div className="space-y-1">
            {CHANGELOG.map((entry, idx) => (
              <div key={entry.version} className="relative flex gap-4">
                {/* Timeline dot */}
                <div className="relative z-10 mt-1 flex-shrink-0">
                  <div className={cn(
                    'w-[9px] h-[9px] rounded-full ring-4 ring-white',
                    idx === 0 ? 'bg-blue-500' : 'bg-gray-300'
                  )} />
                </div>

                {/* Content */}
                <div className={cn(
                  'flex-1 bg-white border rounded-xl p-4 mb-3 transition-all',
                  idx === 0 ? 'border-blue-200 shadow-sm' : 'border-gray-200'
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'font-mono text-xs font-bold px-2 py-0.5 rounded',
                        idx === 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                      )}>
                        v{entry.version}
                      </span>
                      <h4 className="text-sm font-semibold text-gray-900">{entry.title}</h4>
                    </div>
                    <span className="text-xs text-gray-400 font-mono">{entry.date}</span>
                  </div>
                  <ul className="space-y-1">
                    {entry.changes.map((change, ci) => (
                      <li key={ci} className="flex items-start gap-2 text-xs text-gray-600">
                        <span className="text-gray-300 mt-0.5 flex-shrink-0">•</span>
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
