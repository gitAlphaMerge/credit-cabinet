import { createRoot } from "react-dom/client";
import { FutureProducts } from "./FutureProducts";
import { MeetingBooking } from "./CalendarPicker";
import { SideRail } from "./SideRail";
import { SoundToggle } from "./SoundToggle";
import { RequestActivity } from "./RequestActivity";
import { startUiSounds } from "./ui-sounds";
import "./styles.css";
import "./redesign.css";
import "./side-rail.css";
import "./appearance.css";
import "./push-loading.css";
import "./design-system.css";
import "./future-products.css";
import "./site-polish.css";
import "./bank-typography.css";
import "./brand-cursor.css";
import "./omega-cabinet.css";
import "./design-system";
startUiSounds();

function SitePreview() {
  return <main className="preview-audit-shell"><header><div><span className="eyebrow">ЖИВОЙ ПРЕДПРОСМОТР</span><h1>Кредитный кабинет v3</h1></div><SoundToggle/></header><SideRail/>
    <FutureProducts go={path => location.assign(path)}/>
    <section className="preview-audit-meeting"><span className="eyebrow">ИСПРАВЛЕННЫЕ КНОПКИ И ЦВЕТА</span><h2>Звонок с менеджером</h2><MeetingBooking slots={[{id: "sample-1", at: "2026-10-29T12:00:00+03:00", manager: "Менеджер банка"}]} meeting={{slotId:"sample-1",at:"2026-10-29T12:00:00+03:00",manager:"Менеджер банка"}} busy={false} onBook={async () => {}} onCancel={async () => {}}/><p className="future-disclosure">Пример интерфейса. Звонок не назначен, действия не меняют банковские данные.</p></section>
    <RequestActivity/>
  </main>;
}
const root = import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
root.render(<SitePreview/>);
if (import.meta.hot) import.meta.hot.data.root = root;

import "./ui-scale.css";
