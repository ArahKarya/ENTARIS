import { describe, expect, it } from 'vitest';
import { documentMovementLockMessage } from '../documentMovementLock';

describe('documentMovementLockMessage', () => {
  it.each(['GoodsReceipt', 'DeliveryOrder', 'SalesReturn'])('locks %s movements for edit and cancel', (type) => {
    expect(documentMovementLockMessage(type, 'edit')).toMatch(/tidak dapat diedit per baris/);
    expect(documentMovementLockMessage(type, 'cancel')).toMatch(/tidak dapat dibatalkan per baris/);
  });

  it('leaves manual and other movements editable', () => {
    expect(documentMovementLockMessage(null, 'edit')).toBeNull();
    expect(documentMovementLockMessage('JournalEntry', 'cancel')).toBeNull();
  });
});
