import type { StoryMockKey } from "../storyData";
import { AiraIcon } from "../sections/AiraIcon";
import { AiraAnswer, AiraPanel, MockTable, ReceivablesAnswer, ToolRow, UserBubble, type MockRow } from "./AiraMockParts";

const STOCK_ROWS: readonly MockRow[] = [
  ["Kemasan karton 5 kg", "120 pcs", "500 pcs"],
  ["Bahan baku A", "1.850 kg", "3.000 kg"],
  ["Label produk B", "900 lbr", "2.000 lbr"],
];

function ReceivablesMock() {
  return (
    <AiraPanel title="Umur piutang">
      <UserBubble reveal={1}>Berapa piutang yang lewat 60 hari?</UserBubble>
      <ToolRow reveal={2} module="Keuangan" tool="Umur piutang" />
      <ReceivablesAnswer reveal={3} />
    </AiraPanel>
  );
}

function StockMock() {
  return (
    <AiraPanel title="Stok minimum">
      <UserBubble reveal={1}>Stok mana yang di bawah minimum?</UserBubble>
      <ToolRow reveal={2} module="Inventori" tool="Posisi stok" />
      <AiraAnswer reveal={3}>
        <div className="aira-text">
          Ada <strong>3 barang</strong> di bawah batas minimum. Paling kritis: Kemasan karton 5 kg.
        </div>
        <MockTable head={["Barang", "Stok", "Minimum"]} rows={STOCK_ROWS} />
        <div className="aira-msg__source">Sumber: mutasi stok · semua gudang</div>
      </AiraAnswer>
    </AiraPanel>
  );
}

function InvoiceMock() {
  return (
    <AiraPanel title="Draf invoice">
      <div className="aira-doc" data-reveal={1}>
        <div className="aira-doc__head">
          <span>
            <AiraIcon name="receipt" />
            Invoice penjualan
          </span>
          <span className="aira-status aira-status--draft">Draf</span>
        </div>
        <dl className="aira-doc__meta">
          <div>
            <dt>Pelanggan</dt>
            <dd>PT Contoh Jaya</dd>
          </div>
          <div>
            <dt>Disiapkan oleh</dt>
            <dd>AIRA</dd>
          </div>
        </dl>
        <MockTable head={["Barang", "Qty × harga", "Jumlah"]} rows={[["Barang A", "50 × Rp 250.000", "Rp 12.500.000"]]} />
      </div>
      <div className="aira-approval" data-reveal={2}>
        <span className="aira-status aira-status--pending">Menunggu persetujuan</span>
        <div className="aira-text">Tidak ada yang diposting sebelum disetujui pengguna yang berwenang.</div>
        <span className="aira-approval__actions" aria-hidden="true">
          <span className="aira-approval__btn">Tolak</span>
          <span className="aira-approval__btn aira-approval__btn--primary">Setujui</span>
        </span>
      </div>
      <div className="aira-journal" data-reveal={3}>
        <MockTable
          head={["Akun", "Debit", "Kredit"]}
          rows={[
            ["1.2.1 Piutang Usaha", "Rp 12.500.000", "—"],
            ["4.1 Penjualan", "—", "Rp 12.500.000"],
          ]}
          foot={["Total", "Rp 12.500.000", "Rp 12.500.000"]}
        />
        <span className="aira-status aira-status--ok">
          <AiraIcon name="circle-check" />
          Diposting · seimbang
        </span>
      </div>
    </AiraPanel>
  );
}

export function StoryMock({ mock }: { mock: StoryMockKey }) {
  if (mock === "receivables") return <ReceivablesMock />;
  if (mock === "stock") return <StockMock />;
  return <InvoiceMock />;
}
