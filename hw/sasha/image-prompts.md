# Промпты под картинки сайта · 12.10

Куда: места, которые Тоня пометила зелёными звёздами в фигме (лендинг 46:149, анкета 50:301). Сейчас там иконки и узор из кода, картинки их заменят.
Промпты на английском: модели держат его лучше. Текста на картинках нет нигде: весь текст живёт в вёрстке.

## Палитра (в каждом промпте, не убирать)

| токен | hex | где |
|---|---|---|
| accent | `#EF3124` | красный Альфы, главный цвет фигур |
| accent-soft | `#FBE8E7` | бледно-розовый, вторые планы |
| bg | `#F3F4F5` | светло-серый фон страницы |
| ink | `#0B0B0C` | почти-чёрный, мелкие акценты |
| white | `#FFFFFF` | блики, белые фигуры |
| positive | `#13A463` | зелёный, только маленький акцент «всё ок» |

Пропорция: красный и розовый 60%, белый и серый 30%, чёрный и зелёный не больше 10%.

## На что тратить что

| инструмент | что ему отдать | почему |
|---|---|---|
| ChatGPT (1–2 генерации) | **набор из 4 иконок одним листом** (№2) | одна генерация = 4 одинаковые по стилю иконки, прозрачный фон, OpenAI это умеет параметром |
| Nano Banana | hero-картинка (№1 B) и «Зачем спрашиваем» (№4) | у Google есть шаблон «минимализм и негативное пространство», ровно наш случай |
| Qwen | узор (№1 A) и иконки нужд (№3) | честный негатив-промпт, рисует геометрию чисто |
| Canva | узор для фона (№1 A) как запасной | Magic Media берёт только текст промпта, стиль выбираешь кнопкой |

Порядок: сначала №2 в ChatGPT (дороже всего, сделать один раз и хорошо), потом №1 в Nano Banana и Qwen, лучшее выбираем глазами.

---

## №1 · Hero, большая звезда справа от заголовка (квадрат, 400×400 на сайте)

Тоня за обедом хотела «узорчик прикольный», поэтому два варианта: A узор, B объект.

### A · Узор (Qwen, Canva)

**Qwen** (разрешение 1328×1328):
```
A seamless square geometric pattern in Bauhaus style: a 6 by 6 grid of square tiles, each tile holding one flat shape: a quarter circle, a half circle, a full disc, a ring, a diagonal triangle or a short rounded bar, rotated in different directions. Strictly flat vector colors: Alfa red #EF3124, pale pink #FBE8E7, white #FFFFFF, light grey #F3F4F5, with a few near-black #0B0B0C shapes as accents (no more than one in eight tiles). Crisp edges, no gradients, no shadows, no texture, no text. Ultra HD, 4K.
```
Негатив-промпт:
```
text, letters, logo, watermark, gradient, 3d, shadow, blur, noise, texture, people, photo, low resolution, distorted shapes, messy composition
```

**Canva** (Magic Media → стиль «Без стиля» или «Минимализм», квадрат):
```
Flat geometric Bauhaus tile pattern, square grid of circles, quarter circles, half circles and triangles, colors only red #EF3124, pale pink #FBE8E7, white and light grey #F3F4F5, a few black #0B0B0C accents, crisp flat vector, no text, no gradients
```

### B · Объект (Nano Banana, формат 1:1)

Шаблон Google «минимализм и негативное пространство» + «стилизованная иллюстрация»:
```
A minimalist 3D illustration for the hero section of a business banking website. A single sculptural composition placed slightly right of center: a stack of three smooth rounded coins, a short ascending bar chart made of soft rounded blocks, and a small calendar card with one day highlighted, arranged as if resting on an invisible surface. Matte clay material with soft studio lighting from the top left and gentle contact shadows. Color palette strictly: Alfa red #EF3124 for the main forms, pale pink #FBE8E7 for secondary forms, white #FFFFFF highlights, one tiny accent in green #13A463 on the highest bar. Background is a flat light grey #F3F4F5 with large empty space around the objects. Friendly, calm, trustworthy mood for small business owners. No text, no numbers, no logos, no people, no watermark.
```

---

## №2 · Четыре иконки фич на лендинге (ChatGPT, одной генерацией)

Подбор финансирования · Оценка и рекомендации · Управление кредитом · Всегда рядом. На сайте 48×48 в розовом квадрате, рисуем крупно, потом режем.
Настройки, если есть выбор: `1536x1024`, качество high, прозрачный фон.

```
Intended use: a set of four feature icons for a business banking website, displayed small (48 px) next to headings.

Scene: one landscape sheet with four separate icons in a single row, evenly spaced, each centered in its own equal cell with generous padding. Fully transparent background, no backdrop, no checkerboard.

Icons, left to right:
1. "Find financing": a magnifying glass over a rounded coin.
2. "Assessment and recommendations": a clipboard with a checkmark.
3. "Loan management": a calendar card with one highlighted day and a small coin.
4. "Always here": a rounded chat bubble with two short lines inside.

Style, identical for all four: soft 3D clay icons, simple rounded geometry, strong silhouettes that read at 48 px, same camera angle (slight top-down three-quarter view), same soft light from the top left, same scale. Colors strictly from this palette: main forms Alfa red #EF3124, secondary forms pale pink #FBE8E7, highlights white #FFFFFF, small details near-black #0B0B0C. No other colors.

Constraints: no text, no letters, no numbers, no logos or trademarks, no watermark, no drop shadows outside the icon, clean edges with no halos or fringing.
```

Если первая генерация почти ок, вторая только правкой (шаблон OpenAI):
```
Change only icon 3: make the calendar simpler, fewer details. Keep everything else the same, including colors, lighting, camera angle, scale and the transparent background. Do not add new elements, text or logos.
```

---

## №3 · Иконки карточек анкеты «Что вам нужно?» (Qwen или Nano Banana)

Старт бизнеса · Закупка · Кассовый разрыв · Другое. Те же правила, что №2, чтобы стиль совпал: если №2 вышел хорошим, приложи его картинкой и допиши «same style as the attached icons».

**Nano Banana** (1:1, по одной иконке, меняешь только строку предмета):
```
A single soft 3D clay icon for a business banking form, centered on a plain white #FFFFFF background with lots of padding. Subject: [a small rocket lifting off from a coin | a cardboard box with a pale pink lid | a coin bridging a small gap between two blocks | four small rounded shapes in a 2 by 2 grid]. Simple rounded geometry, strong silhouette readable at 40 px, slight top-down three-quarter view, soft light from the top left. Colors strictly: Alfa red #EF3124 main forms, pale pink #FBE8E7 secondary forms, white highlights, tiny near-black #0B0B0C details. No text, no logos, no watermark.
```

**Qwen** (1328×1328): тот же текст, плюс негатив-промпт из №1 A.

---

## №4 · «Зачем мы спрашиваем данные?» (Nano Banana, 4:5)

Блок справа от анкеты, мягкий розовый градиент. Картинка встаёт в верх блока, текст под ней.
```
A minimalist 3D illustration, portrait 4:5. Bottom half: a small open folder made of matte pale pink #FBE8E7 clay with three rounded document cards peeking out, the front card marked only with a red #EF3124 checkmark shape and a tiny green #13A463 dot. A soft red #EF3124 shield shape rests against the folder, meaning the data is protected. Top half: completely empty flat background fading from white #FFFFFF to pale pink #FBE8E7, left for text. Soft studio light from the top left, gentle contact shadow. Calm, safe, trustworthy mood. No text, no letters, no logos, no people, no watermark.
```

---

## Что делаем с готовым

Скидываешь в `hw/tonya/generated/` (имя по номеру: `01b-hero.png`, `02-features.png`) или прямо в чат, Клод режет лист, жмёт в webp и ставит на сайт вместо иконок и узора. Тоне показать до сайта: места её, финальное слово её.

## Источники

- OpenAI, GPT Image Generation Models Prompting Guide: порядок «сцена → объект → детали → ограничения», назвать назначение картинки, прозрачный фон и чистые края для иконок, шаблон правки «Change only X, keep everything else the same». https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide.md
- Google, Gemini API · Image generation: шаблоны «стилизованная иллюстрация» и «минимализм и негативное пространство» (объект не в центре, большое пустое поле под текст), «чем конкретнее, тем больше контроля». https://ai.google.dev/gemini-api/docs/image-generation
- Qwen, README Qwen-Image: разрешения (1:1 = 1328×1328), негатив-промпт, хвост «Ultra HD, 4K», текст на картинке в кавычках. https://github.com/QwenLM/Qwen-Image
- Canva, справка Magic Media: модель берёт только текст промпта, чем конкретнее, тем лучше. Официального гайда по Dream Lab не нашёл. https://www.canva.com/help/using-magic-media/
