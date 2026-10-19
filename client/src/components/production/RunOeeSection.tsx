/** Collapsible "Data Produksi & OEE" section of the production run dialog (all optional). */
import { Plus, Trash2, ChevronDown, ChevronRight, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/shared';
import { useTranslation } from 'react-i18next';
import { LOCALE } from '@/lib/format';
import { DOWNTIME_CATEGORIES, type DowntimeLine, type MachineLine, type MachineOption, type OeePreview } from './run-form-utils';

const NONE = '__none';
const rowClass = 'rounded-lg border border-border bg-muted/40 p-3';

interface RunOeeSectionProps {
  open: boolean;
  onToggle: () => void;
  plannedStart: string;
  plannedEnd: string;
  breakStart: string;
  breakEnd: string;
  shift: string;
  shiftLead: string;
  manpowerCount: string;
  onPlannedStart: (v: string) => void;
  onPlannedEnd: (v: string) => void;
  onBreakStart: (v: string) => void;
  onBreakEnd: (v: string) => void;
  onShift: (v: string) => void;
  onShiftLead: (v: string) => void;
  onManpowerCount: (v: string) => void;
  runMachines: MachineLine[];
  machines: MachineOption[];
  machineById: Map<string, MachineOption>;
  onAddMachine: () => void;
  onRemoveMachine: (idx: number) => void;
  onUpdateMachine: (idx: number, patch: Partial<MachineLine>) => void;
  downtimes: DowntimeLine[];
  onAddDowntime: () => void;
  onRemoveDowntime: (idx: number) => void;
  onUpdateDowntime: (idx: number, patch: Partial<DowntimeLine>) => void;
  preview: OeePreview | null;
}

function QtyChip({ label, value, text, tone }: { label: string; value?: number; text?: string; tone?: 'danger' | 'success' }) {
  const labelCls = tone === 'danger' ? 'text-danger-text' : tone === 'success' ? 'text-success-text' : 'text-muted-foreground';
  const display = text != null ? text : (value ?? 0).toLocaleString(LOCALE, { maximumFractionDigits: 3 });
  return (
    <div className="rounded-md border border-border bg-card px-1.5 py-1.5">
      <p className={`truncate text-[11px] font-semibold uppercase tracking-wide ${labelCls}`}>{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">{display}</p>
    </div>
  );
}

function PreviewMetric({ label, pct, highlight }: { label: string; pct: number | null; highlight?: boolean }) {
  return (
    <div className={highlight ? 'rounded-lg bg-info-subtle px-1.5 py-2' : 'px-1.5 py-2'}>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-info-text">{label}</p>
      <p className={highlight ? 'font-mono text-base font-bold tabular-nums text-info-text' : 'font-mono text-sm font-semibold tabular-nums text-info-text'}>
        {pct != null ? `${pct.toFixed(1)}%` : '—'}
      </p>
    </div>
  );
}

const pct1 = (v: number | null) => (v != null ? `${v.toFixed(1)}%` : '—');

export function RunOeeSection(p: RunOeeSectionProps) {
  const { t } = useTranslation('production');
  const { preview } = p;
  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <h3>
        <button
          type="button"
          onClick={p.onToggle}
          aria-expanded={p.open}
          aria-controls="run-oee-panel"
          className="flex min-h-11 w-full items-center justify-between bg-info-subtle/60 px-4 py-2.5 text-left transition-colors hover:bg-info-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-info-text">
            <Gauge className="size-3.5" aria-hidden /> {t('runOeeSection.heading')}
            <span className="text-[11px] font-normal normal-case">{t('runOeeSection.optional')}</span>
          </span>
          {p.open ? <ChevronDown className="size-4 text-info-text" aria-hidden /> : <ChevronRight className="size-4 text-info-text" aria-hidden />}
        </button>
      </h3>
      {p.open && (
        <div id="run-oee-panel" className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('runOeeSection.shiftStart')}>
              <Input type="datetime-local" value={p.plannedStart} onChange={(e) => p.onPlannedStart(e.target.value)} />
            </Field>
            <Field label={t('runOeeSection.shiftEnd')}>
              <Input type="datetime-local" value={p.plannedEnd} onChange={(e) => p.onPlannedEnd(e.target.value)} />
            </Field>
            <Field label={t('runOeeSection.breakStart')}>
              <Input type="datetime-local" value={p.breakStart} onChange={(e) => p.onBreakStart(e.target.value)} />
            </Field>
            <Field label={t('runOeeSection.breakEnd')}>
              <Input type="datetime-local" value={p.breakEnd} onChange={(e) => p.onBreakEnd(e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('runOeeSection.shift')}>
              {(control) => (
                <Select value={p.shift || NONE} onValueChange={(v) => p.onShift(v === NONE ? '' : v)}>
                  <SelectTrigger {...control}>
                    <SelectValue placeholder={t('runOeeSection.selectShift')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('runOeeSection.selectShift')}</SelectItem>
                    <SelectItem value="1">{t('runOeeSection.shiftN', { n: 1 })}</SelectItem>
                    <SelectItem value="2">{t('runOeeSection.shiftN', { n: 2 })}</SelectItem>
                    <SelectItem value="3">{t('runOeeSection.shiftN', { n: 3 })}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label={t('runOeeSection.shiftLead')}>
              <Input value={p.shiftLead} onChange={(e) => p.onShiftLead(e.target.value)} placeholder={t('runOeeSection.shiftLeadPlaceholder')} />
            </Field>
            <Field label={t('runOeeSection.manpower')}>
              <NumberInput min="0" step="1" value={p.manpowerCount} onChange={(e) => p.onManpowerCount(e.target.value)} placeholder={t('runOeeSection.manpowerPlaceholder')} className="h-10 text-right tabular-nums" />
            </Field>
          </div>

          {/* Machines (parallel) */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('runOeeSection.machinesHeading')}</h4>
              <Button type="button" variant="ghost" size="sm" onClick={p.onAddMachine}>
                <Plus aria-hidden /> {t('runOeeSection.addMachine')}
              </Button>
            </div>
            {p.runMachines.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('runOeeSection.noMachines')}</p>
            ) : (
              <ul className="space-y-2">
                {p.runMachines.map((m, idx) => {
                  const machine = p.machineById.get(m.machineId);
                  return (
                    <li key={idx} className={`${rowClass} space-y-3`}>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <Select value={m.machineId || NONE} onValueChange={(v) => p.onUpdateMachine(idx, { machineId: v === NONE ? '' : v })}>
                            <SelectTrigger aria-label={t('runOeeSection.machineRowAria', { n: idx + 1 })}>
                              <SelectValue placeholder={t('runOeeSection.selectMachine')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>{t('runOeeSection.selectMachine')}</SelectItem>
                              {p.machines.map((opt) => (
                                <SelectItem key={opt.id} value={opt.id}>
                                  {opt.code} · {opt.name}
                                  {opt.idealRatePerHour != null ? ` ${t('runOeeSection.idealRate', { rate: Number(opt.idealRatePerHour).toLocaleString(LOCALE), unit: opt.unit })}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="button" variant="ghost" size="icon-touch" className="text-muted-foreground hover:text-danger-text" onClick={() => p.onRemoveMachine(idx)} aria-label={t('runOeeSection.removeMachine', { n: idx + 1 })}>
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Field label={t('runOeeSection.machineStart')}>
                          <Input type="datetime-local" value={m.startAt} onChange={(e) => p.onUpdateMachine(idx, { startAt: e.target.value })} />
                        </Field>
                        <Field label={t('runOeeSection.machineEnd')}>
                          <Input type="datetime-local" value={m.endAt} onChange={(e) => p.onUpdateMachine(idx, { endAt: e.target.value })} />
                        </Field>
                      </div>
                      {m.machineId && machine && machine.idealRatePerHour == null && (
                        <p className="text-xs text-warning-text">{t('runOeeSection.noIdealRate')}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Output derived from Input/Output lines (read-only) */}
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('runOeeSection.derivedOutput')}</p>
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
              <QtyChip label={t('runOeeSection.chipInput')} value={preview?.summary.inputQty ?? 0} />
              <QtyChip label={t('runOeeSection.chipProduct')} value={preview?.summary.produkQty ?? 0} />
              <QtyChip label={t('runOeeSection.chipByProduct')} value={preview?.summary.sampingQty ?? 0} />
              <QtyChip label={t('runOeeSection.chipLoss')} value={preview?.summary.lossQty ?? 0} tone="danger" />
              <QtyChip label={t('runOeeSection.chipYield')} text={preview?.summary.yieldPct != null ? `${preview.summary.yieldPct.toFixed(1)}%` : '—'} tone="success" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{t('runOeeSection.qualityHint')}</p>
          </div>

          {/* Downtime list (optional per-machine attribution) */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('runOeeSection.downtimeHeading')}</h4>
              <Button type="button" variant="ghost" size="sm" onClick={p.onAddDowntime}>
                <Plus aria-hidden /> {t('runOeeSection.addDowntime')}
              </Button>
            </div>
            {p.downtimes.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('runOeeSection.noDowntime')}</p>
            ) : (
              <ul className="space-y-2">
                {p.downtimes.map((d, idx) => (
                  <li key={idx} className={`${rowClass} grid gap-2 sm:grid-cols-2`}>
                    <Select value={d.machineId || NONE} onValueChange={(v) => p.onUpdateDowntime(idx, { machineId: v === NONE ? '' : v })}>
                      <SelectTrigger aria-label={t('runOeeSection.downtimeMachineAria', { n: idx + 1 })}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t('runOeeSection.allLine')}</SelectItem>
                        {p.runMachines.filter((m) => m.machineId).map((m) => {
                          const opt = p.machineById.get(m.machineId);
                          return (
                            <SelectItem key={m.machineId} value={m.machineId}>
                              {opt ? `${opt.code} · ${opt.name}` : m.machineId}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <Select value={d.category} onValueChange={(v) => p.onUpdateDowntime(idx, { category: v })}>
                      <SelectTrigger aria-label={t('runOeeSection.downtimeCategoryAria', { n: idx + 1 })}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOWNTIME_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{t(`runOeeSection.downtimeCategories.${c}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <NumberInput min="0" step="0.01" value={d.durationMin} onChange={(e) => p.onUpdateDowntime(idx, { durationMin: e.target.value })} placeholder={t('runOeeSection.duration')} aria-label={t('runOeeSection.durationAria', { n: idx + 1 })} className="h-10 text-right tabular-nums" />
                      <span className="text-xs text-muted-foreground">{t('runOeeSection.minutes')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input value={d.reason} onChange={(e) => p.onUpdateDowntime(idx, { reason: e.target.value })} placeholder={t('runOeeSection.reasonPlaceholder')} aria-label={t('runOeeSection.reasonAria', { n: idx + 1 })} />
                      <Button type="button" variant="ghost" size="icon-touch" className="shrink-0 text-muted-foreground hover:text-danger-text" onClick={() => p.onRemoveDowntime(idx)} aria-label={t('runOeeSection.removeDowntime', { n: idx + 1 })}>
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* OEE preview: per-machine table + line aggregate */}
          {preview && (preview.machines.length > 0 || preview.line.availabilityPct != null || preview.line.performancePct != null || preview.line.qualityPct != null) && (
            <div className="space-y-3 rounded-lg border border-info/30 bg-info-subtle px-4 py-3">
              <div className="flex items-center gap-1.5">
                <Gauge className="size-3.5 text-info-text" aria-hidden />
                <span className="text-xs font-bold uppercase tracking-wide text-info-text">{t('runOeeSection.previewHeading')}</span>
              </div>
              {preview.machines.length > 0 && (
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable at phone width
                <div className="overflow-x-auto" role="region" aria-label={t('runOeeSection.previewTableAria')} tabIndex={0}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-info-text">
                        <th scope="col" className="py-1 pr-2 font-semibold">{t('runOeeSection.colMachine')}</th>
                        <th scope="col" className="px-1 py-1 text-right font-semibold">{t('runOeeSection.colRunTime')}</th>
                        <th scope="col" className="px-1 py-1 text-right font-semibold">{t('runOeeSection.colAllocation')}</th>
                        <th scope="col" className="px-1 py-1 text-right font-semibold">A</th>
                        <th scope="col" className="px-1 py-1 text-right font-semibold">P</th>
                        <th scope="col" className="px-1 py-1 text-right font-semibold">Q</th>
                        <th scope="col" className="py-1 pl-1 text-right font-semibold">OEE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.machines.map((m, i) => (
                        <tr key={i} className="border-t border-info/20 text-foreground">
                          <td className="max-w-[140px] truncate py-1 pr-2">{m.label}</td>
                          <td className="px-1 py-1 text-right font-mono tabular-nums">{m.runMin.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} {t('runOeeSection.minuteShort')}</td>
                          <td className="px-1 py-1 text-right font-mono tabular-nums">{m.allocatedQty.toLocaleString(LOCALE, { maximumFractionDigits: 1 })}</td>
                          <td className="px-1 py-1 text-right font-mono tabular-nums">{pct1(m.availabilityPct)}</td>
                          <td className="px-1 py-1 text-right font-mono tabular-nums">{pct1(m.performancePct)}</td>
                          <td className="px-1 py-1 text-right font-mono tabular-nums">{pct1(m.qualityPct)}</td>
                          <td className="py-1 pl-1 text-right font-mono font-bold tabular-nums">{pct1(m.oeePct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-info-text">{t('runOeeSection.lineAggregate')}</p>
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <PreviewMetric label={t('runOeeSection.availability')} pct={preview.line.availabilityPct} />
                  <PreviewMetric label={t('runOeeSection.performance')} pct={preview.line.performancePct} />
                  <PreviewMetric label={t('runOeeSection.quality')} pct={preview.line.qualityPct} />
                  <PreviewMetric label="OEE" pct={preview.line.oeePct} highlight />
                </div>
              </div>
              <p className="text-xs text-info-text">{t('runOeeSection.previewNote')}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
