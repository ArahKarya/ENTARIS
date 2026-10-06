import { AiraAnswer, AiraPanel, ToolRow, UserBubble } from "../mock/AiraMockParts";
import { AiraEyebrow } from "./AiraEyebrow";
import { AiraIcon, type AiraIconName } from "./AiraIcon";

/*
 * #analitik — AIRA as an analyst. Every capability below maps to read-only tools declared in
 * server/src/ai/aira-tool-router.json (rpt_profit_loss, rpt_dash_financial_ratios,
 * rpt_profitability_sku, inv_dash_movement_trend, prod_dash_yield_trend, rpt_export, …).
 * No forecasting or root-cause detection is claimed: the router has neither; AIRA fetches period
 * reports and summarises what changed.
 */

type Capability = { icon: AiraIconName; title: string; items: readonly string[] };

const CAPABILITIES: readonly Capability[] = [
  {
    icon: "trending-up",
    title: "Kinerja keuangan",
    items: ["Laba rugi & neraca per periode", "Tren laba bulanan", "Rasio keuangan ringkas"],
  },
  {
    icon: "cash",
    title: "Kas & likuiditas",
    items: ["Posisi kas & bank saat ini", "Laporan arus kas", "Jadwal jatuh tempo piutang & hutang"],
  },
  {
    icon: "users",
    title: "Penjualan & pelanggan",
    items: ["Pelanggan teratas berdasarkan omzet", "Invoice lewat jatuh tempo & umur piutang", "Profitabilitas per SKU"],
  },
  {
    icon: "receipt",
    title: "Pembelian & beban",
    items: ["Vendor teratas berdasarkan pembelian", "Rincian beban per kategori", "Laporan pajak per periode"],
  },
  {
    icon: "building-factory",
    title: "Stok & produksi",
    items: ["Tren pergerakan stok", "Peringatan stok rendah & minus", "HPP & tren rendemen produksi"],
  },
  {
    icon: "file-export",
    title: "Siap dibagikan",
    items: ["Neraca saldo & buku besar", "Laporan operasional harian", "Ekspor laporan ke Excel / PDF"],
  },
];

/* Sample monthly profit for the mockup chart (Rp juta). */
const PROFIT_BARS: readonly { month: string; value: number }[] = [
  { month: "Jul", value: 412 },
  { month: "Agu", value: 455 },
  { month: "Sep", value: 361 },
];
const PROFIT_MAX = 480;

function AnalyticsMock() {
  return (
    <AiraPanel title="Analisis laba">
      <UserBubble>Kenapa laba September turun dibanding Agustus?</UserBubble>
      <ToolRow module="Laporan" tool="Laba rugi per periode · Profitabilitas SKU" />
      <AiraAnswer>
        <div className="aira-text">
          Laba September <strong>Rp 361 jt</strong>, turun <strong>20,7%</strong> dari Agustus. Pos yang paling berubah: beban pengiriman dan
          margin satu SKU.
        </div>
        <div className="aira-chart" role="img" aria-label="Grafik contoh laba bulanan Juli 412 juta, Agustus 455 juta, September 361 juta">
          {PROFIT_BARS.map((bar) => (
            <div key={bar.month} className="aira-chart__col">
              <span className="aira-chart__value">{bar.value}</span>
              <span className="aira-chart__track">
                <span className="aira-chart__bar" style={{ height: `${(bar.value / PROFIT_MAX) * 100}%` }} data-last={bar.month === "Sep" || undefined} />
              </span>
              <span className="aira-chart__label">{bar.month}</span>
            </div>
          ))}
        </div>
        <ul className="aira-findings">
          <li>
            <strong>Beban pengiriman</strong> +Rp 58 jt (naik 34%)
          </li>
          <li>
            <strong>Penjualan</strong> −Rp 41 jt dibanding Agustus
          </li>
          <li>
            <strong>Margin SKU kemasan 5 kg</strong> turun 4 poin
          </li>
        </ul>
        <div className="aira-msg__source">Sumber: buku besar · laba rugi Jul–Sep · profitabilitas per SKU</div>
      </AiraAnswer>
    </AiraPanel>
  );
}

export function AiraAnalytics() {
  return (
    <section id="analitik" className="tacet-proto-section aira-analytics">
      <div className="tacet-proto-wrap tacet-proto-two-col">
        <AiraEyebrow name="Analitik" context="Analisis dari buku besar" />
        <div>
          <div className="tacet-proto-copy">
            <h2>Bukan cuma angka — AIRA merangkum apa yang berubah.</h2>
            <p>
              AIRA membaca laporan yang sama dengan modul Laporan — laba rugi, neraca, arus kas, umur piutang, HPP — lalu membandingkan periode,
              menunjukkan pos yang paling berubah, dan merangkum angka yang perlu perhatian. Tanpa ekspor ke spreadsheet, tanpa menunggu laporan
              disusun manual.
            </p>
          </div>
          <div className="aira-analytics__grid">
            <ul className="aira-capabilities">
              {CAPABILITIES.map((cap) => (
                <li key={cap.title}>
                  <AiraIcon name={cap.icon} className="aira-capabilities__icon" />
                  <h3>{cap.title}</h3>
                  <ul>
                    {cap.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <div className="aira-analytics__mock">
              <AnalyticsMock />
            </div>
          </div>
          <p className="aira-analytics__note">
            <AiraIcon name="user-shield" />
            Analisis hanya membaca data — tidak ada yang berubah di pembukuan. Akses laporan diatur admin per peran, jadi setiap pengguna hanya
            melihat angka yang memang boleh ia lihat.
          </p>
        </div>
      </div>
    </section>
  );
}
