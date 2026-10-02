import { useState } from 'react';
import { cn } from '../lib/utils';
import DeliveryOrdersOfficial from './DeliveryOrdersOfficial';
import TemporaryDeliveryNotes from './TemporaryDeliveryNotes';

type Tab = 'official' | 'temporary';

// Halaman Surat Jalan: tab "Surat Jalan Resmi" (DO, memotong stok) dan
// "Surat Jalan Sementara" (tanpa stok/GL, ditautkan ke DO resmi kemudian).
export const DeliveryOrders = () => {
  const [tab, setTab] = useState<Tab>('official');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'official', label: 'Surat Jalan Resmi' },
    { id: 'temporary', label: 'Surat Jalan Sementara' },
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors',
              tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'official' ? <DeliveryOrdersOfficial /> : <TemporaryDeliveryNotes />}
    </div>
  );
};

export default DeliveryOrders;
