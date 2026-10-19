import { describe, expect, it } from 'vitest';
import { translateFields } from '../translateFields';

describe('translateFields', () => {
  const data = {
    attention: [{ key: 'mt-wo', title: '3 work order lewat target', detail: 'Terlama 12 hari', href: '/ga/maintenance' }],
    upcoming: [{ kindLabel: 'Asuransi kendaraan', title: 'Asuransi Jasindo', assetName: 'Truk B 1234' }],
  };

  it('translates only the listed fields for English', () => {
    const out = translateFields(data, 'en', ['title', 'detail', 'kindLabel']);
    expect(out.attention[0]).toMatchObject({ title: '3 work orders past target', detail: 'Oldest 12 days', href: '/ga/maintenance' });
    expect(out.upcoming[0]).toEqual({ kindLabel: 'Vehicle insurance', title: 'Insurance Jasindo', assetName: 'Truk B 1234' });
  });

  it('returns the input untouched for Indonesian or no language', () => {
    expect(translateFields(data, 'id', ['title'])).toBe(data);
    expect(translateFields(data, null, ['title'])).toBe(data);
  });

  it('does not mutate the input', () => {
    translateFields(data, 'en', ['title']);
    expect(data.attention[0].title).toBe('3 work order lewat target');
  });

  it('translates aging labels and leaves unknown text as is', () => {
    expect(translateFields([{ label: 'Belum JT' }, { label: '>90 hari' }, { label: 'Data pengguna' }], 'en', ['label']))
      .toEqual([{ label: 'Not yet due' }, { label: '>90 days' }, { label: 'Data pengguna' }]);
  });
});
