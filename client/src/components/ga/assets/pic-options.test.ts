import { describe, expect, it } from 'vitest';
import { picOptions } from './pic-options';

describe('picOptions', () => {
  it('maps users to options', () => {
    expect(picOptions([{ id: 'u1', fullName: 'Budi' }], null)).toEqual([{ value: 'u1', label: 'Budi' }]);
  });

  it('keeps the current PIC when the user list is unavailable', () => {
    expect(picOptions(undefined, { id: 'u9', fullName: 'Sari' })).toEqual([{ value: 'u9', label: 'Sari' }]);
  });

  it('does not duplicate the current PIC', () => {
    const opts = picOptions([{ id: 'u1', fullName: 'Budi' }], { id: 'u1', fullName: 'Budi' });
    expect(opts).toHaveLength(1);
  });
});
