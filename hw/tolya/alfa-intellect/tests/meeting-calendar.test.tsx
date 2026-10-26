import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { meetingSlotTimes } from "../server/mvp2";
import { MeetingBooking, meetingDays, meetingIcs } from "../src/CalendarPicker";

test("five Moscow working days, half-hour slots, no elapsed times", () => {
  const now = new Date("2026-10-23T15:45:00Z"); // Friday 18:45 MSK
  const slots = meetingSlotTimes(now);
  assert.equal(slots.length, 90);
  assert.equal(slots[0], "2026-10-26T10:00:00+03:00");
  assert.equal(slots.at(-1), "2026-10-30T18:30:00+03:00");
  assert.ok(slots.every((at) => Date.parse(at) > now.getTime()));
  assert.ok(
    slots.every((at) => [0, 30].includes(new Date(at).getUTCMinutes())),
  );
  assert.equal(
    meetingSlotTimes(new Date("2026-10-26T07:15:00Z"))[0],
    "2026-10-26T10:30:00+03:00",
  );
});

test("ICS uses the correct UTC instant and a thirty-minute duration", () => {
  const ics = meetingIcs("2026-10-26T10:30:00+03:00", "slot-1");
  assert.match(ics, /DTSTART:20261026T073000Z\r\n/);
  assert.match(ics, /DTEND:20261026T080000Z\r\n/);
});

test("returning with a persisted booking shows confirmation", () => {
  const at = "2026-10-26T10:30:00+03:00";
  const html = renderToStaticMarkup(
    <MeetingBooking
      slots={[{ id: at, at, manager: "Менеджер" }]}
      meeting={{ slotId: at, at, manager: "Менеджер" }}
      busy={false}
      onBook={async () => {}}
      onCancel={async () => {}}
    />,
  );
  assert.match(html, /Менеджер позвонит/);
  assert.match(html, /Добавить в календарь/);
  assert.doesNotMatch(html, /Выберите день и время/);
  assert.equal(
    meetingDays(
      [{ id: at, at, manager: "Менеджер" }],
      new Date("2026-10-26T07:00:00Z"),
    ).length,
    1,
  );
});
