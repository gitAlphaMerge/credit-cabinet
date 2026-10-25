// Названия сверяются с <title> исходных SVG приёмочным тестом G6.
// В бандл попадают только пути и названия, геометрия остаётся в public/icons.
export const illustrationTitles = {
  "products/ALFA_DELO": "Деньги на дело",
  "products/ALFA_LUMP_SEC": "Кредит одной суммой с залогом",
  "products/ALFA_LUMP_UNSEC": "Кредит одной суммой без залога",
  "products/ALFA_NCL_SEC": "Невозобновляемая линия с залогом",
  "products/ALFA_OVERDRAFT": "Овердрафт",
  "products/ALFA_RCL_UNSEC": "Возобновляемая кредитная линия без залога",
  "products/ALFA_REFI": "Рефинансирование",
  "products/ALFA_START": "Альфа-Старт",
  "status/approved": "Одобрено",
  "status/disbursed": "Деньги на счёте",
  "status/expired": "Истекла",
  "status/info_requested": "Нужен документ",
  "status/offered": "Предложение",
  "status/queued-manager": "У менеджера",
  "status/queued-sent": "Отправлена",
  "status/rejected": "Отказ",
  "status/signed": "Подписано",
  "status/underwriting-checks": "Проверяем",
  "status/underwriting": "У андеррайтера",
  "status/withdrawn": "Отозвана",
  "docs/balance": "Баланс",
  "docs/business-plan": "Бизнес-план",
  "docs/customer-contract": "Договор с заказчиком",
  "docs/debt-schedule": "График долга",
  "docs/income": "Отчёт о прибылях",
  "docs/questionnaire": "Анкета",
  "docs/reconciliation": "Акт сверки",
  "docs/statement": "Выписка",
  "checks/aml": "115-ФЗ",
  "checks/bankruptcy": "Банкротство",
  "checks/credit-history": "Кредитная история",
  "checks/egrul": "ЕГРЮЛ",
  "checks/fns": "ФНС",
  "empty/applications": "Нет заявок",
  "empty/network": "Ошибка сети",
  "empty/notifications": "Нет уведомлений",
  "empty/ready": "Всё готово",
  "empty/upload": "Загрузка файла",
} as const;

type IllustrationKey = keyof typeof illustrationTitles;
type Group = "products" | "status" | "docs" | "checks" | "empty";
type Name<G extends Group> = IllustrationKey extends infer K
  ? K extends `${G}/${infer N}`
    ? N
    : never
  : never;
type DisplayProps = {
  size?: 32 | 48 | 64 | 96;
  decorative?: boolean;
  className?: string;
};
type Props = { [G in Group]: { group: G; name: Name<G> } }[Group] &
  DisplayProps;
const neutral: IllustrationKey = "docs/questionnaire";
function hasKey<T extends object>(
  table: T,
  key: string,
): key is keyof T & string {
  return Object.hasOwn(table, key);
}
function lookup(
  table: Record<string, IllustrationKey>,
  key?: string,
): IllustrationKey {
  return key && hasKey(table, key) ? table[key] : neutral;
}

export const statusIllustrations = {
  draft: "docs/questionnaire",
  queued: "status/queued-manager",
  info_requested: "status/info_requested",
  underwriting: "status/underwriting",
  approved: "status/approved",
  offered: "status/offered",
  signed: "status/signed",
  disbursed: "status/disbursed",
  rejected: "status/rejected",
  expired: "status/expired",
  withdrawn: "status/withdrawn",
} as const satisfies Record<string, IllustrationKey>;

// Единственная таблица совместимости старого, нового и экранного каталогов.
// ID поступает из записи каталога, никаких выводов из названия продукта.
export const productIllustrations = {
  ALFA_DELO: "products/ALFA_DELO",
  ALFA_LUMP_SEC: "products/ALFA_LUMP_SEC",
  ALFA_LUMP_UNSEC: "products/ALFA_LUMP_UNSEC",
  ALFA_NCL_SEC: "products/ALFA_NCL_SEC",
  ALFA_OVERDRAFT: "products/ALFA_OVERDRAFT",
  ALFA_RCL_UNSEC: "products/ALFA_RCL_UNSEC",
  ALFA_REFI: "products/ALFA_REFI",
  ALFA_START: "products/ALFA_START",
  WORKING: "products/ALFA_DELO",
  INVEST: neutral,
  RCL: "products/ALFA_RCL_UNSEC",
  NCL: neutral,
  OVERDRAFT: "products/ALFA_OVERDRAFT",
  REFI: "products/ALFA_REFI",
  working: "products/ALFA_DELO",
  investment: neutral,
  revolving: "products/ALFA_RCL_UNSEC",
  contract: neutral,
  overdraft: "products/ALFA_OVERDRAFT",
  refinance: "products/ALFA_REFI",
} as const satisfies Record<string, IllustrationKey>;

const documentIllustrations = {
  statement: "docs/statement",
  balance: "docs/balance",
  pnl: "docs/income",
  plan: "docs/business-plan",
  schedule: "docs/debt-schedule",
  contract_main_customer: "docs/customer-contract",
  reconciliation_act: "docs/reconciliation",
  model: neutral,
} as const satisfies Record<string, IllustrationKey>;
const checkIllustrations = {
  egrul: "checks/egrul",
  fns: "checks/fns",
  bankruptcy: "checks/bankruptcy",
  aml: "checks/aml",
  bki: "checks/credit-history",
} as const satisfies Record<string, IllustrationKey>;

function Image({
  icon,
  size = 48,
  decorative = false,
  className = "",
}: DisplayProps & { icon: IllustrationKey }) {
  return (
    <img
      className={"illustration " + className}
      src={"/icons/" + icon + ".svg"}
      alt={decorative ? "" : illustrationTitles[icon]}
      aria-hidden={decorative ? true : undefined}
      width={size}
      height={size}
      decoding="async"
      style={{
        width: size,
        height: size,
        maxWidth: "100%",
        objectFit: "contain",
        flexShrink: 0,
        verticalAlign: "middle",
        background: "#fff",
        borderRadius: 8,
      }}
    />
  );
}
export function Illustration({ group, name, ...display }: Props) {
  const key = `${group}/${name}`;
  return (
    <Image
      icon={hasKey(illustrationTitles, key) ? key : neutral}
      {...display}
    />
  );
}
export function StatusIllustration({
  status,
  ...display
}: DisplayProps & { status: string }) {
  return <Image icon={lookup(statusIllustrations, status)} {...display} />;
}
export function ProductIllustration({
  productId,
  ...display
}: DisplayProps & { productId?: string }) {
  return <Image icon={lookup(productIllustrations, productId)} {...display} />;
}
export function DocumentIllustration({
  category,
  ...display
}: DisplayProps & { category: string }) {
  return <Image icon={lookup(documentIllustrations, category)} {...display} />;
}
export function CheckIllustration({
  check,
  ...display
}: DisplayProps & { check: string }) {
  return <Image icon={lookup(checkIllustrations, check)} {...display} />;
}
