/** Optional "Aset EAM terkait" picker: links a fixed asset to its EAM asset (one to one). */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { ComboboxField } from '@/components/overlays/ComboboxField';
import { eamAssetOptions, type EamAssetListRow, type EamAssetRef } from './eam-link';

interface EamAssetPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Fixed asset being edited (undefined on create). */
  selfId?: string;
  /** Current link, shown even when it is outside the loaded list. */
  current?: EamAssetRef | null;
  enabled?: boolean;
}

export function EamAssetPicker({ value, onChange, selfId, current, enabled = true }: EamAssetPickerProps) {
  const allowed = can('ga_assets', 'view');
  const query = useQuery<EamAssetListRow[]>({
    queryKey: ['ga-assets', 'fixed-asset-link'],
    queryFn: async () => (await api.get('/ga/assets', { params: { limit: 500, sort: 'code' } })).data ?? [],
    enabled: enabled && allowed,
    staleTime: 60_000,
  });
  const options = eamAssetOptions(query.data ?? [], selfId, current);
  const hint = !allowed
    ? 'Butuh akses modul Aset EAM untuk memilih.'
    : query.isError
      ? 'Daftar aset EAM gagal dimuat.'
      : 'Opsional. Satu aset EAM hanya untuk satu aset tetap; nilai buku tampil di detail aset EAM.';

  return (
    <ComboboxField
      label="Aset EAM terkait"
      value={value}
      onChange={onChange}
      options={options}
      placeholder={query.isLoading ? 'Memuat…' : 'Tidak ditautkan'}
      hint={hint}
      disabled={!allowed}
    />
  );
}
