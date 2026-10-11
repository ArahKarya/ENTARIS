/** Optional "Aset EAM terkait" picker: links a fixed asset to its EAM asset (one to one). */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { ComboboxField } from '@/components/overlays/ComboboxField';
import { eamAssetOptions, type EamAssetListRow, type EamAssetRef } from './eam-link';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('eam');
  const allowed = can('ga_assets', 'view');
  const query = useQuery<EamAssetListRow[]>({
    queryKey: ['ga-assets', 'fixed-asset-link'],
    queryFn: async () => (await api.get('/ga/assets', { params: { limit: 500, sort: 'code' } })).data ?? [],
    enabled: enabled && allowed,
    staleTime: 60_000,
  });
  const options = eamAssetOptions(query.data ?? [], selfId, current);
  const hint = !allowed
    ? t('assets.eamPicker.noAccess')
    : query.isError
      ? t('assets.eamPicker.loadError')
      : t('assets.eamPicker.hint');

  return (
    <ComboboxField
      label={t('assets.eamPicker.label')}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={query.isLoading ? t('assets.eamPicker.loading') : t('assets.eamPicker.notLinked')}
      hint={hint}
      disabled={!allowed}
    />
  );
}
