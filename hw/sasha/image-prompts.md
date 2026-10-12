# Промпты под картинки сайта · v2, 12.10

Куда: места, которые Тоня пометила зелёными звёздами в фигме (лендинг 46:149, анкета 50:301).
Цель v2: всё, что нагенерим, потом **редактируется в Claude Design** с дизайн-системой «Кредитный агент · Альфа».

## Главное правило: два вида выхода

Claude Design собирает экраны из HTML и SVG. SVG там правится до точки: цвет, форма, размер. Растровая картинка (PNG) только двигается и масштабируется как есть.

| что | чем генерим | выход | что потом можно править в Claude Design |
|---|---|---|---|
| узор (№1) | чат ChatGPT / Qwen / Gemini, **текстом** | SVG-код | всё: цвета, плитки, размер сетки |
| иконки (№2, №3) | чат ChatGPT / Qwen / Gemini, **текстом** | SVG-код | всё: толщина линии, цвета, детали |
| 3D-объекты для hero (№4) | картинка: ChatGPT / Nano Banana / Qwen-Image / Canva | PNG, каждый объект отдельным файлом, без фона | расстановку, размер, порядок слоёв, тень под ними |
| иллюстрация «Зачем спрашиваем» (№5) | картинка, так же | PNG отдельными объектами | так же |

Отсюда три правила для картинок: **без текста** (текст живёт в вёрстке), **без фона** (прозрачный или однотонный под вырез), **один объект на файл** (компоновку делаем в Claude Design, а не в нейронке).

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

## Куда складывать

Всё в `hw/tonya/generated/`, имя по номеру: `01-pattern.svg`, `02-icon-find.svg`, `04-coins.png`. Клод загружает их в дизайн-систему (группы Patterns, Icons, Illustrations), и в Claude Design они уже под рукой вместе с токенами. Тоне показать до сайта: места её, финальное слово её.

---

## №1 · Узор на месте большой звезды (SVG-кодом)

Вставляешь в обычный чат (ChatGPT, Qwen Chat или Gemini), не в генератор картинок.

```
Write a single self-contained SVG file, nothing else in the answer except the code.

Purpose: a decorative square pattern for the hero section of a business banking website. It will be edited later in a design tool, so the code must be clean and editable.

Canvas: viewBox="0 0 384 384", no width or height attributes.
Grid: 6 by 6 square tiles of 64 by 64.
Each tile: a background rect plus exactly one flat shape chosen from: quarter circle, half circle, full disc, ring (stroke 8), right triangle, short rounded bar. Rotate shapes in steps of 90 degrees so the grid feels rhythmic, not random noise.

Colors: define them once as CSS variables in a <style> block and use only these, via classes:
--accent: #EF3124; --accent-soft: #FBE8E7; --white: #FFFFFF; --bg: #F3F4F5; --ink: #0B0B0C.
Tile backgrounds use only white, bg and accent-soft. Shapes are mostly accent, some accent-soft, and ink in at most 4 tiles.

Code rules: group each tile in <g id="tile-ROW-COL">, use plain <rect>, <circle>, <path>; no filters, no gradients, no masks, no text, no embedded images, no scripts. Round coordinates to whole numbers.
```

Если ритм не нравится, второй заход: `Keep the same code structure and palette. Change only the shapes in rows 2 and 5 so there are more half circles. Return the full SVG again.`

**Запасной вариант картинкой** (Canva Magic Media или Qwen-Image), если SVG выйдет скучным. Тогда в Claude Design он только картинкой, без правки:
```
Flat geometric Bauhaus tile pattern, 6 by 6 square grid of quarter circles, half circles, discs, rings and triangles, colors only red #EF3124, pale pink #FBE8E7, white #FFFFFF and light grey #F3F4F5, a few black #0B0B0C accents, crisp flat vector, no text, no gradients, no shadows
```
Qwen-Image: 1328×1328, негатив-промпт `text, letters, logo, watermark, gradient, 3d, shadow, blur, noise, texture, people, photo, low resolution, distorted shapes`.

---

## №2 · Четыре иконки фич на лендинге (SVG-кодом)

Подбор финансирования · Оценка и рекомендации · Управление кредитом · Всегда рядом. На сайте 24 px внутри розового квадрата 48 px.

```
Write four separate SVG icons, each in its own code block, nothing else in the answer.

Purpose: feature icons for a business banking website, shown at 24 px inside a pale pink square. They will be edited later in a design tool, so keep the code minimal and editable.

Every icon: viewBox="0 0 24 24", fill="none", stroke="#EF3124", stroke-width="1.8", stroke-linecap="round", stroke-linejoin="round". Line icons only, no fills, no text. Simple geometry, 2 to 5 shapes per icon, readable at 24 px. Same visual weight and corner style across all four.

1. "Find financing": a magnifying glass with a small plus inside the lens.
2. "Assessment and recommendations": a square with a checkmark, the top-right corner of the square open.
3. "Loan management": a calendar with two binding rings and one short line for a date.
4. "Always here": a rounded chat bubble with a tail at the bottom-left and two short text lines inside.

Code rules: plain <path>, <circle>, <rect>, <line>; no transforms, no groups unless needed, whole or .5 coordinates.
```

## №3 · Иконки карточек анкеты «Что вам нужно?» (SVG-кодом)

Тот же чат, сразу следом, чтобы стиль совпал:
```
Same style and the same rules as the four icons above. Four more icons:
1. "Start a business": a small rocket at a 45 degree angle with a short exhaust line.
2. "Purchasing stock": a box in three-quarter view, the top edge of the lid visible.
3. "Cash gap": a pulse line that dips once and comes back up.
4. "Other": a small house with a door, simple roof.
```

---

## №4 · 3D-объекты для hero (картинкой, каждый объект отдельно)

Если узор из №1 Тоне не зашёл, на место звезды ставим композицию из 3D-объектов. Генерим их **по одному**, одинаковым светом, без фона, а складываем в Claude Design. Так можно двигать, менять размер и выкидывать лишнее.

Объекты: (a) стопка из трёх монет, (b) столбики роста из трёх скруглённых блоков, (c) карточка-календарь с одним выделенным днём, (d) щит со скруглёнными углами.

**ChatGPT** (прозрачный фон умеет сам; настройки, если есть выбор: 1024×1024, качество high, фон transparent). Одна генерация = один объект, меняешь только строку `Object:`.
```
Intended use: one isolated 3D object for a website hero. It will be placed and arranged together with other objects in a design tool, so it must stand alone.

Object: [a stack of three smooth rounded coins | three rounded blocks rising like a bar chart, the tallest with a tiny green #13A463 top | a small calendar card with one highlighted day | a rounded shield].

Style: soft 3D clay, matte, simple rounded geometry, slight top-down three-quarter view, soft light from the top left. Colors strictly: main forms Alfa red #EF3124, secondary forms pale pink #FBE8E7, highlights white #FFFFFF, tiny details near-black #0B0B0C.

Background: fully transparent, object centered with generous padding. No backdrop, no floor, no shadow outside the object, clean edges with no halos or fringing.
Constraints: no text, no numbers, no letters, no logos, no watermark.
```

**Nano Banana** (1:1). Прозрачный фон в документации Gemini не обещан, поэтому однотонный фон под вырез, вырезаешь потом кнопкой «удалить фон» в Canva:
```
A single isolated 3D object for a website, centered on a perfectly flat, uniform light grey #F3F4F5 background with generous padding, no floor, no horizon, no cast shadow on the background. Object: [один из списка выше]. Soft matte 3D clay, simple rounded geometry, slight top-down three-quarter view, soft light from the top left. Colors strictly: Alfa red #EF3124 main forms, pale pink #FBE8E7 secondary forms, white highlights, tiny near-black #0B0B0C details. No text, no numbers, no logos, no watermark.
```

**Qwen-Image** (1328×1328): тот же текст, что для Nano Banana, плюс негатив-промпт `text, letters, logo, watermark, floor, horizon, background objects, cast shadow, gradient background, low resolution, distorted shapes, messy composition`.

## №5 · «Зачем мы спрашиваем данные?» (картинкой, объекты отдельно)

Объекты: (a) открытая папка из бледно-розовой глины с тремя карточками-документами, на передней только красная галочка, (b) щит из №4, его переиспользуем. Фон блока даёт вёрстка (градиент из токенов), его не генерим. Промпт тот же, что в №4, строка `Object:`:
```
a small open folder made of pale pink #FBE8E7 clay with three rounded document cards peeking out, the front card marked only with a red #EF3124 checkmark shape and a tiny green #13A463 dot
```

---

## В Claude Design

Открываешь новый дизайн с системой «Кредитный агент · Альфа», загружаешь файлы из `hw/tonya/generated/` и пишешь:
```
Use the design system "Кредитный агент · Альфа". Place 01-pattern.svg into the hero illustration slot (400 by 400, radius-art corners). Use the SVG icons from 02 and 03 inside 48 px squares filled with accent-soft, radius 14. Keep all colors as tokens from the system, do not introduce new colors.
```
Готовый дизайн кидаешь Клоду ссылкой со словами «перенеси на сайт».

## Источники

- OpenAI, GPT Image Generation Models Prompting Guide: назвать назначение картинки, порядок «сцена → объект → детали → ограничения», прозрачный фон (`background="transparent"`, PNG), чистые края без ореолов, правка «Change only X, keep everything else the same». https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide.md
- Google, Gemini API · Image generation: шаблоны «стилизованная иллюстрация» и «минимализм и негативное пространство», «чем конкретнее, тем больше контроля». Про прозрачный фон в доке ничего не нашёл, поэтому однотонный фон и вырез. https://ai.google.dev/gemini-api/docs/image-generation
- Qwen, README Qwen-Image: разрешения (1:1 = 1328×1328), негатив-промпт. https://github.com/QwenLM/Qwen-Image
- Canva, справка Magic Media: модель берёт только текст промпта, чем конкретнее, тем лучше. Официального гайда по Dream Lab не нашёл. https://www.canva.com/help/using-magic-media/
- SVG-кодом вместо картинки: это моё решение под Claude Design, не из гайдов.
