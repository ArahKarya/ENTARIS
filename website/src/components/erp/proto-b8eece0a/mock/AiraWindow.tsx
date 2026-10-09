import { EntarisMark } from "@/components/site/EntarisLogo";
import { AiraMark } from "@/components/site/AiraLogo";
import { AiraIcon, type AiraIconName } from "../sections/AiraIcon";
import { ReceivablesAnswer, SampleBadge, seqStyle, ToolRow, UserBubble } from "./AiraMockParts";

type SideItem = { label: string; icon: AiraIconName; active?: boolean };

const SIDE_ITEMS: readonly SideItem[] = [
  { label: "Dashboard", icon: "dashboard" },
  { label: "Penjualan", icon: "shopping-cart" },
  { label: "Pembelian", icon: "truck" },
  { label: "Inventori", icon: "box" },
  { label: "Keuangan", icon: "report-money" },
  { label: "Approval", icon: "circle-check" },
  { label: "AIRA", icon: "send", active: true },
];

const FOLLOW_UPS: readonly string[] = ["Rinci per invoice", "Bandingkan dengan bulan lalu"];

/**
 * Hero mockup: the AIRA chat inside the Entaris app shell. Static markup; the entrance sequence
 * (`data-seq`) is played by useAiraHeroPlay via the `data-aira-play` attribute.
 */
export function AiraWindow() {
  return (
    <div className="aira-app" data-aira-play="">
      <div className="aira-app__bar">
        <span className="aira-app__brand">
          <EntarisMark size={18} />
          Entaris
        </span>
        <span className="aira-app__crumb">AIRA · Percakapan baru</span>
        <SampleBadge />
      </div>
      <div className="aira-app__body">
        <nav className="aira-app__side" aria-label="Menu contoh aplikasi">
          <ul>
            {SIDE_ITEMS.map((item) => (
              <li key={item.label} className={item.active ? "is-active" : undefined}>
                {item.label === "AIRA" ? <AiraMark size={16} /> : <AiraIcon name={item.icon} />}
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
          <div className="aira-app__role">
            Masuk sebagai
            <strong>Accountant</strong>
          </div>
        </nav>
        <div className="aira-app__main">
          <div className="aira-chat">
            <UserBubble seq={0}>Berapa piutang yang lewat 60 hari?</UserBubble>
            <ToolRow seq={1} module="Keuangan" tool="Umur piutang" />
            <ReceivablesAnswer seq={2} />
            <div className="aira-chips" data-seq={3} style={seqStyle(3)}>
              {FOLLOW_UPS.map((label) => (
                <span key={label} className="aira-chip">
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="aira-composer" aria-hidden="true">
            <span className="aira-composer__input">Tanya AIRA…</span>
            <span className="aira-composer__send">
              <AiraIcon name="send" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
