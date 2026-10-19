import type { Chat } from "../shared/types";
export const STARTER_PROMPTS = [
  "Как оценить кредитную нагрузку?",
  "Какие документы нужны?",
  "Объясни мой последний расчёт",
];
export const COMPOSER_MAX_HEIGHT = 180;
export function composerHeight(scrollHeight: number) {
  return Math.min(
    COMPOSER_MAX_HEIGHT,
    Math.max(24, Number.isFinite(scrollHeight) ? scrollHeight : 24),
  );
}
export function filterChats(chats: Chat[], query: string) {
  const q = query.trim().toLocaleLowerCase("ru");
  return chats.filter((chat) => chat.title.toLocaleLowerCase("ru").includes(q));
}
