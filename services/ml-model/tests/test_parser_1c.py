"""Regression checks for 1C bank exchange parsing and stable transfer matching."""

import tempfile
import unittest
from pathlib import Path

import core


ACCOUNT_A = "40702810000000000001"
ACCOUNT_B = "40702810000000000002"
OTHER = "40817810000000000003"
NEED = {"purpose": "кассовый разрыв", "amount_rub": 100000, "term_months": 12}
QUESTIONNAIRE = {"form": "ООО", "years": "больше 3"}


def document(number, amount, payer, payee, purpose, date="01.01.2026", posted=""):
    """Make an independent minimal 1C document with unsigned bank amount."""
    return "\n".join(("СекцияДокумент=Платежное поручение", f"Номер={number}",
                      f"Сумма={amount}", f"Плательщик1={payer}",
                      f"ПлательщикСчет={ACCOUNT_A if payer == 'Наша фирма' else OTHER}",
                      f"Получатель1={payee}",
                      f"ПолучательСчет={ACCOUNT_B if payee == 'Наша фирма' else OTHER}",
                      f"НазначениеПлатежа={purpose}", f"{posted}={date}" if posted else f"Дата={date}",
                      "КонецДокумента"))


def exchange():
    """Make three documents across two own accounts with varied posting dates."""
    return "\n".join(("1CClientBankExchange", "ВерсияФормата=1.03", "Кодировка=Windows",
                      f"РасчСчет={ACCOUNT_A}", "СекцияРасчСчет", f"РасчСчет={ACCOUNT_B}",
                      "КонецРасчСчет", "",
                      document(1, "1000,00", "Покупатель", "Наша фирма", "Оплата товара", posted="ДатаПоступило"),
                      "", document(2, "300,00", "Наша фирма", "Поставщик", "Оплата материалов", posted="ДатаСписано"),
                      "", document(3, "100,00", "Наша фирма", "Иванов Иван", "Перевод физическому лицу"),
                      "КонецФайла", ""))


class Parser1CTests(unittest.TestCase):
    def parse_bytes(self, payload):
        """Read through the public file based entry point."""
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "statement.txt"
            path.write_bytes(payload)
            return core.read_csv(str(path))

    def test_multiline_accounts_dates_and_cash(self):
        rows = self.parse_bytes(exchange().encode("cp1251"))
        self.assertEqual([r["amount"] for r in rows], [1000.0, -300.0, -100.0])
        self.assertEqual([r["counterparty"] for r in rows], ["Покупатель", "Поставщик", "Иванов Иван"])
        self.assertEqual([r["date"] for r in rows], ["2026-01-01"] * 3)
        self.assertEqual(core.classify(**{k: rows[2][k] for k in ("amount", "counterparty", "purpose")}), "cash")
        self.assertEqual(core.classify(-100, "Зарплатный проект", "Заработная плата по реестру"), "mandatory")

    def test_encoding_newlines_and_bom(self):
        text = exchange()
        expected = self.parse_bytes(text.encode("cp1251"))
        self.assertEqual(len(expected), 3)
        for payload in (text.encode("utf-8"), text.encode("utf-8-sig"),
                        text.replace("\n", "\r\n").encode("cp1251")):
            with self.subTest(payload=payload[:24]):
                self.assertEqual(self.parse_bytes(payload), expected)

    def test_legacy_pipe_record(self):
        text = ("1CClientBankExchange\n"
                "СекцияДокумент=Платежное поручение|Дата=02.02.2026|Сумма=-250,00|"
                "Контрагент=Поставщик|Назначение=Материалы|КонецДокумента\n"
                f"РасчСчет={ACCOUNT_A}\n"
                + document(2, "50,00", "Наша фирма", "Поставщик", "Материалы")
                + "\nКонецФайла\n")
        self.assertEqual([r["amount"] for r in self.parse_bytes(text.encode("utf-8"))], [-250.0, -50.0])

    def test_csv_1c_score_parity(self):
        with tempfile.TemporaryDirectory() as folder:
            csv_path = Path(folder) / "statement.csv"
            one_c_path = Path(folder) / "statement.txt"
            csv_path.write_text("date,amount,counterparty,purpose\n"
                                "2026-01-01,1000,Покупатель,Оплата товара\n"
                                "2026-01-01,-300,Поставщик,Оплата материалов\n"
                                "2026-01-01,-100,Иванов Иван,Перевод физическому лицу\n", encoding="utf-8")
            one_c_path.write_bytes(exchange().encode("cp1251"))
            actual = [core.score(str(path), NEED, QUESTIONNAIRE)
                      for path in (csv_path, one_c_path)]
            for key in ("status", "flow_month_rub", "stops_fired", "evidence"):
                self.assertEqual(actual[0][key], actual[1][key], key)

    def test_csv_shuffle_keeps_score(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "statement.csv"
            header = "date,amount,counterparty,purpose\n"
            rows = [f"2026-{month:02d}-01,10000,Клиент,Оплата товара\n" for month in range(1, 13)]
            rows += ["2026-01-02,1000,Иванов Иван,Поступление\n",
                     "2026-06-02,1100,Иванов Иван,Поступление\n",
                     "2026-06-03,-1000,Иванов Иван,Оплата\n"]
            path.write_text(header + "".join(rows), encoding="utf-8")
            first = core.score(str(path), NEED, QUESTIONNAIRE)
            path.write_text(header + "".join(reversed(rows)), encoding="utf-8")
            second = core.score(str(path), NEED, QUESTIONNAIRE)
            self.assertEqual(first, second)

    def test_mixed_inn_does_not_depend_on_first_row(self):
        source = [
            {"date": "2026-01-01", "amount": 1000.0, "counterparty": "ООО Контрагент", "purpose": "Оплата", "inn": None, "label": "inflow"},
            {"date": "2026-01-02", "amount": -1000.0, "counterparty": "ООО Контрагент", "purpose": "Оплата", "inn": "123456789012", "label": "operating"},
        ]
        for rows in (source, list(reversed(source))):
            copied = [dict(row) for row in rows]
            core.resolve_financing_pairs(copied)
            self.assertEqual([row["label"] for row in copied], ["financing"] * 2)


if __name__ == "__main__":
    unittest.main()
