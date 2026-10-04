/** Service log (with optional GL journal) and service request (approval flow) forms. */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ClipboardList, Send, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS, URGENCIES, URGENCY_LABELS } from '../constants';
import { apiError, numOrNull } from '../vehicle-model';
import { FieldRow, ModalForm, ModalShell, SelectField, TextAreaField, TextField } from './form-kit';

interface ModalProps {
  assetId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface CoaAccount {
  id: string;
  accountNumber: string;
  name: string;
  isGroup: boolean;
}

export function ServiceLogModal({ assetId, onClose, onSaved }: ModalProps) {
  const [f, setF] = useState({ tanggal: '', odometer: '', jenisService: 'SERVIS_BERKALA', deskripsi: '', bengkel: '', biaya: '' });
  const [postJournal, setPostJournal] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));

  // Accounts for the journal option (loaded only when it is ticked).
  const { data: coaFlat = [] } = useQuery<CoaAccount[]>({
    queryKey: ['coa-flat'],
    queryFn: async () => (await api.get('/coa/flat')).data,
    enabled: postJournal,
    staleTime: 5 * 60 * 1000,
  });
  const expenseOptions = useMemo(
    () => coaFlat.filter((a) => !a.isGroup && String(a.accountNumber).startsWith('6.')),
    [coaFlat],
  );
  const sourceOptions = useMemo(
    () =>
      coaFlat.filter(
        (a) => !a.isGroup && (String(a.accountNumber).startsWith('1.1.') || String(a.accountNumber) === '2.1.1'),
      ),
    [coaFlat],
  );

  // Smart default until the user picks one: fuel/parking/toll → 6.3, anything else → 6.7.
  const defaultAccountId = useMemo(() => {
    const want = /bbm|bensin|solar|parkir|tol|pertalite|pertamax/i.test(f.deskripsi) ? '6.3' : '6.7';
    return expenseOptions.find((o) => o.accountNumber === want)?.id ?? '';
  }, [expenseOptions, f.deskripsi]);
  const effectiveAccountId = accountId || defaultAccountId;

  const mut = useMutation({
    mutationFn: () =>
      api.post(`/ga/vehicle/assets/${assetId}/services`, {
        tanggal: f.tanggal,
        odometer: numOrNull(f.odometer),
        jenisService: f.jenisService,
        deskripsi: f.deskripsi,
        bengkel: f.bengkel || null,
        biaya: numOrNull(f.biaya),
        postJournal,
        accountId: postJournal ? effectiveAccountId || null : null,
        creditAccountId: postJournal ? creditAccountId || null : null,
      }),
    onSuccess: () => {
      toast.success(postJournal ? 'Service log tersimpan + jurnal dibuat.' : 'Service log ditambahkan.');
      onSaved();
    },
    onError: (e) => toast.error(apiError(e, 'Gagal simpan service log.')),
  });

  const label = (a: CoaAccount) => `${a.accountNumber} — ${a.name}`;

  return (
    <ModalShell title="Tambah Service Log" icon={Wrench} onClose={onClose}>
      <ModalForm onSubmit={() => mut.mutate()} onCancel={onClose} submitting={mut.isPending}>
        <FieldRow>
          <TextField label="Tanggal" type="date" value={f.tanggal} onChange={set('tanggal')} required />
          <SelectField label="Jenis service" value={f.jenisService} onChange={set('jenisService')} options={SERVICE_TYPES} labels={SERVICE_TYPE_LABELS} />
        </FieldRow>
        <TextField label="Deskripsi" value={f.deskripsi} onChange={set('deskripsi')} required />
        <FieldRow>
          <TextField label="Odometer (km)" type="number" value={f.odometer} onChange={set('odometer')} />
          <TextField label="Biaya (Rp)" type="number" value={f.biaya} onChange={set('biaya')} />
        </FieldRow>
        <TextField label="Bengkel" value={f.bengkel} onChange={set('bengkel')} />

        <div className="space-y-3 rounded-md border border-border bg-muted/50 p-3">
          <div className="flex items-start gap-2">
            <input
              id="svc-post-journal"
              type="checkbox"
              checked={postJournal}
              onChange={(e) => setPostJournal(e.target.checked)}
              className="mt-0.5 size-4 rounded border-input accent-[var(--primary)]"
            />
            <label htmlFor="svc-post-journal" className="cursor-pointer text-sm">
              <span className="font-medium text-foreground">Catat ke jurnal keuangan</span>
              <span className="block text-xs text-muted-foreground">
                Membuat jurnal otomatis: debit akun beban, kredit kas/bank. Jangan dicentang bila biaya ini sudah
                diinput manual di modul Keuangan.
              </span>
            </label>
          </div>
          {postJournal && (
            <FieldRow>
              <SelectField
                label="Akun beban (debit)"
                value={effectiveAccountId}
                onChange={setAccountId}
                options={expenseOptions.map((a) => a.id)}
                labels={Object.fromEntries(expenseOptions.map((a) => [a.id, label(a)]))}
                emptyLabel="— pilih akun beban —"
              />
              <SelectField
                label="Sumber dana (kredit)"
                value={creditAccountId}
                onChange={setCreditAccountId}
                options={sourceOptions.map((a) => a.id)}
                labels={Object.fromEntries(sourceOptions.map((a) => [a.id, label(a)]))}
                emptyLabel="— default: kas utama —"
              />
            </FieldRow>
          )}
        </div>
      </ModalForm>
    </ModalShell>
  );
}

export function ServiceRequestModal({ assetId, onClose, onSaved }: ModalProps) {
  const [f, setF] = useState({ jenisService: 'PERBAIKAN', odometer: '', deskripsi: '', urgensi: 'MEDIUM' });
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const mut = useMutation({
    mutationFn: () =>
      api.post(`/ga/vehicle/assets/${assetId}/service-requests`, {
        jenisService: f.jenisService,
        odometer: numOrNull(f.odometer),
        deskripsi: f.deskripsi,
        urgensi: f.urgensi,
      }),
    onSuccess: () => {
      toast.success('Pengajuan dikirim.');
      onSaved();
    },
    onError: (e) => toast.error(apiError(e, 'Gagal mengirim pengajuan.')),
  });
  return (
    <ModalShell title="Ajukan Service" icon={ClipboardList} onClose={onClose} description="Pengajuan menunggu persetujuan sebelum dikerjakan.">
      <ModalForm onSubmit={() => mut.mutate()} onCancel={onClose} submitting={mut.isPending} submitLabel="Kirim" submitIcon={Send}>
        <SelectField label="Jenis service" value={f.jenisService} onChange={set('jenisService')} options={SERVICE_TYPES} labels={SERVICE_TYPE_LABELS} />
        <TextAreaField label="Deskripsi" value={f.deskripsi} onChange={set('deskripsi')} required />
        <FieldRow>
          <TextField label="Odometer (km)" type="number" value={f.odometer} onChange={set('odometer')} />
          <SelectField label="Urgensi" value={f.urgensi} onChange={set('urgensi')} options={URGENCIES} labels={URGENCY_LABELS} />
        </FieldRow>
      </ModalForm>
    </ModalShell>
  );
}
