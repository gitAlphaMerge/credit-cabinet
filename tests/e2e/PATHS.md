# Карта путей стенда

Срез кода: 19.10.2026. Только чтение сайтов; HTTP-тесты не исполняют JS и не заменяют ручной клик на ширинах 375 и 1280. В таблицах указаны строки исходников. Повторяющиеся элементы перечислены на каждой странице.

## Основной сайт: сценарии

1. `/` -> `anketa.html`: пять ответов, сохранение `sessionStorage[anketa-v1]`, `zagruzka.html`, через 2,6 секунды `kabinet.html?tour=1`. Тур: Дальше по 5 шагам, Пропустить закрывает.
2. Кабинет: анализ, документация, обсуждение ведут в `razgovor.html`; варианты финансирования возвращают к анкете. Форма отправляет `q` в URL, но разговор его не читает.
3. Разговор: анкета обязательна; цель при необходимости -> сумма -> срок -> источник -> при договоре сумма/месяцы -> CSV (файл, drop или 4 демо) -> POST `/api/score` -> статус, причины, лимиты. Сделаю подтверждает договор и повторяет score; неподдерживаемый документ показывает пояснение. Ошибка CSV позволяет другой файл; сбой сети позволяет повтор. Менеджер открывает диалог-заглушку, Понятно закрывает.
4. `/v2/`: главная -> чат, кабинет, подбор. Чат: чип задачи -> CSV -> score -> ответ; свободные последующие вопросы отвечают заглушкой. Голос/звонок показывают симуляцию. Подбор стартует сразу на результате; параметры и Сделаю меняют локальные константы. Кабинет показывает локальную демонстрацию, вкладки/платежи/прогноз/контекст чата. `puti.html` и `v2/karta.html` являются картами, отдельного бизнес-сценария нет.

## Основной сайт: все ссылки, кнопки, формы и ресурсы

Для `@click` указан обработчик из `renderVals`; его значение и переходы перечислены после элементов страницы. Кнопка без обработчика и без submit не совершает действие. `href=#` возвращает к верху. Внешние шрифты HTTP-тест не запрашивает.

### /anketa.html

| Строка | Элемент / текст | Переход, ресурс или действие |
|---|---|---|
| 7 | link: link | `href=https://fonts.googleapis.com` |
| 8 | link: link | `href=https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap` |
| 9 | link: link | `href=site.css` |
| 15 | a: Альфа-Банк Бизнес | `href=/` |
| 20 | a: Подбор финансирования | `href=/` |
| 21 | a: Кредитный кабинет | `href=/#cabinet` |
| 22 | a: Аналитика | `href=/#features` |
| 23 | a: О продукте | `href=/#features` |
| 25 | a: Профиль | `href=#; aria-label=Профиль` |
| 36 | form: form | `id=form` |
| 40 | input: need | `type=radio; name=need` |
| 43 | input: need | `type=radio; name=need` |
| 46 | input: need | `type=radio; name=need` |
| 49 | input: need | `type=radio; name=need` |
| 58 | input: form | `type=radio; name=form` |
| 59 | input: form | `type=radio; name=form` |
| 60 | input: form | `type=radio; name=form` |
| 61 | input: form | `type=radio; name=form` |
| 79 | input: years | `type=radio; name=years` |
| 80 | input: years | `type=radio; name=years` |
| 81 | input: years | `type=radio; name=years` |
| 82 | input: years | `type=radio; name=years` |
| 89 | input: trend | `type=radio; name=trend` |
| 90 | input: trend | `type=radio; name=trend` |
| 91 | input: trend | `type=radio; name=trend` |
| 97 | button: Продолжить | `type=submit; id=go` |
| 116 | button: Позвать менеджера | `type=button; id=mgrBtn` |
| 124 | form: form | `method=dialog` |
| 124 | button: Понятно | `submit текущей формы` |
| 127 | script: script | `нет адреса/обработчика` |

JS: переходы, fetch, динамические действия (строка: код):

```text
129: document.getElementById('mgrBtn').onclick = () => document.getElementById('mgr').showModal();
154: form.addEventListener('change', () => {
159: form.addEventListener('submit', e => {
163: location.href = 'zagruzka.html';
```

### /index.html

| Строка | Элемент / текст | Переход, ресурс или действие |
|---|---|---|
| 7 | link: link | `href=https://fonts.googleapis.com` |
| 8 | link: link | `href=https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap` |
| 9 | link: link | `href=site.css` |
| 15 | a: Альфа-Банк Бизнес | `href=/` |
| 20 | a: Подбор финансирования | `href=/` |
| 21 | a: Кредитный кабинет | `href=#cabinet` |
| 22 | a: Аналитика | `href=#features` |
| 23 | a: О продукте | `href=#features` |
| 25 | a: Профиль | `href=#; aria-label=Профиль` |
| 37 | a: Попробовать бесплатно | `href=anketa.html` |
| 42 | img: img | `src=pattern.svg` |
| 105 | script: script | `src=live-pattern.js` |

JS: переходы, fetch, динамические действия (строка: код):

```text
```

### /kabinet.html

| Строка | Элемент / текст | Переход, ресурс или действие |
|---|---|---|
| 7 | link: link | `href=https://fonts.googleapis.com` |
| 8 | link: link | `href=https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap` |
| 9 | link: link | `href=site.css` |
| 108 | a: Альфа-Банк Бизнес | `href=/` |
| 113 | a: Подбор финансирования | `href=anketa.html` |
| 114 | a: Кредитный кабинет | `href=kabinet.html` |
| 115 | a: Аналитика | `href=/#features` |
| 116 | a: О продукте | `href=/#features` |
| 118 | a: Профиль | `href=#; aria-label=Профиль` |
| 167 | a: Подбор финансирования | `href=anketa.html; data-tour=5` |
| 169 | button: История чата | `type=button` |
| 178 | a: Проанализировать бизнес | `href=razgovor.html` |
| 179 | a: Загрузить документацию | `href=razgovor.html` |
| 180 | a: Посмотреть варианты финансирования | `href=anketa.html` |
| 181 | a: Обсудить проблему | `href=razgovor.html` |
| 184 | form: form | `action=razgovor.html` |
| 185 | input: Сообщение агенту | `name=q; aria-label=Сообщение агенту` |
| 186 | button: Отправить | `type=submit` |
| 193 | script: script | `нет адреса/обработчика` |

JS: переходы, fetch, динамические действия (строка: код):

```text
206: if (new URLSearchParams(location.search).get('tour') !== '1') return;
255: tip.querySelector('.next').addEventListener('click', () => (++i < STEPS.length ? show() : end()));
256: tip.querySelector('.skip').addEventListener('click', end);
257: addEventListener('resize', () => cur && place());
258: addEventListener('scroll', () => cur && place(), { passive: true });
```

### /puti.html

| Строка | Элемент / текст | Переход, ресурс или действие |
|---|---|---|
| 7 | link: link | `href=https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap` |
| 8 | link: link | `href=site.css` |
| 102 | script: script | `src=https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js` |
| 103 | script: script | `нет адреса/обработчика` |

JS: переходы, fetch, динамические действия (строка: код):

```text
```

### /razgovor.html

| Строка | Элемент / текст | Переход, ресурс или действие |
|---|---|---|
| 7 | link: link | `href=https://fonts.googleapis.com` |
| 8 | link: link | `href=https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap` |
| 9 | link: link | `href=site.css` |
| 102 | a: Альфа-Банк Бизнес | `href=/` |
| 107 | a: Подбор финансирования | `href=/` |
| 108 | a: Кредитный кабинет | `href=/#cabinet` |
| 109 | a: Аналитика | `href=/#features` |
| 110 | a: О продукте | `href=/#features` |
| 112 | a: Профиль | `href=#; aria-label=Профиль` |
| 122 | button: Позвать менеджера | `type=button; data-manager=None` |
| 126 | form: composer | `id=composer` |
| 127 | input: Ваш ответ | `id=input; aria-label=Ваш ответ` |
| 128 | button: Отправить | `type=submit` |
| 144 | form: form | `method=dialog` |
| 144 | button: Понятно | `submit текущей формы` |
| 147 | script: script | `нет адреса/обработчика` |

JS: переходы, fetch, динамические действия (строка: код):

```text
122: <button class="btn btn-ghost" type="button" data-manager><span>Позвать </span>менеджера</button>
149: const API = '/api/score';
238: b.onclick = () => answer(o);
252: $('composer').addEventListener('submit', e => { e.preventDefault(); answer(input.value); input.value = ''; });
331: drop.querySelectorAll('[data-demo]').forEach(b => b.onclick = async () => {
333: const r = await fetch(`demo/${d.file}.csv`);
336: drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
337: drop.addEventListener('dragleave', () => drop.classList.remove('over'));
338: drop.addEventListener('drop', async e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) take(f.name, await f.text()); });
366: const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
411: <button class="btn btn-primary" type="button" data-step="${s.code}">Сделаю</button></div>`).join('')}</div></div>` : ''}
413: <button class="btn btn-ghost" type="button" data-manager>Позвать менеджера</button>
417: el.querySelectorAll('[data-manager]').forEach(b => b.onclick = openManager);
418: el.querySelectorAll('[data-step]').forEach(b => b.onclick = () => doStep(b.dataset.step, el));
424: async function doStep(code, el) {
439: async function fail(res) {
444: <div class="row"><button class="chip" type="button" data-again>Загрузить другой файл</button></div>`, 'err');
445: e.querySelector('[data-again]').onclick = () => { e.remove(); askStatement(); };
449: const e = block(`<div class="row"><button class="chip" type="button" data-retry>Повторить</button><button class="chip" type="button" data-manager>Позвать менеджера</button></div>`, 'err');
450: e.querySelector('[data-retry]').onclick = () => { e.remove(); analyse(state.statement.trim().split('\n').length - 1); };
451: e.querySelector('[data-manager]').onclick = openManager;
484: function openManager() { $('mgr').showModal(); }
485: document.querySelectorAll('[data-manager]').forEach(b => b.onclick = openManager);
```

### /v2/chat.html

| Строка | Элемент / текст | Переход, ресурс или действие |
|---|---|---|
| 7 | link: link | `href=https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap` |
| 59 | input: statement-file | `id=statement-file; type=file; @change=v.selectFile` |
| 64 | img: img | `src=img/alfa.svg` |
| 67 | a: Главная | `href=index.html` |
| 67 | a: Кредитный кабинет | `href=kabinet.html` |
| 67 | a: ИИ-агент | `href=chat.html` |
| 67 | a: Подбор | `href=podbor.html` |
| 69 | button: Уведомления, 2 новых | `type=button; aria-label=Уведомления, 2 новых` |
| 73 | button: Профиль | `type=button; aria-label=Профиль` |
| 82 | button: Новый чат | `type=button; @click=v.reset` |
| 88 | input: Поиск по чатам | `type=search; aria-label=Поиск по чатам` |
| 93 | button: База навыков · 12 | `type=button; @click=v.openDb` |
| 97 | button: button | `type=button; @click=k.pick` |
| 99 | img: img | `нет адреса/обработчика` |
| 112 | button: {{ h.title }} {{ h.when }} | `type=button` |
| 136 | button: Голосом | `type=button; @click=v.toggleVoice` |
| 140 | a: Позвать менеджера | `href=#` |
| 191 | button: Выбрать CSV | `type=button; @click=v.upload` |
| 192 | button: демо-выписка | `type=button; @click=v.demoUpload` |
| 198 | button: попробовать ещё раз | `type=button; @click=v.retryUpload` |
| 244 | button: Сделаю | `type=button` |
| 256 | button: {{ c.label }} | `type=button; @click=c.pick` |
| 269 | button: Навык: {{ v.skillName }} × | `type=button; @click=v.clearSkill` |
| 273 | button: Прикрепить: выписка, 1С, документ | `type=button; aria-label=Прикрепить: выписка, 1С, документ; @click=v.upload` |
| 277 | input: msg2 | `id=msg2; type=text` |
| 278 | button: Надиктовать | `type=button; aria-label=Надиктовать` |
| 281 | button: Голос | `type=button; aria-label=Голосовой режим; @click=v.toggleVoice` |
| 285 | button: Отправить | `type=button; aria-label=Отправить` |
| 290 | button: PRO | `type=button; aria-label=Позвонить агенту, функция Pro; @click=v.startCall` |
| 317 | button: Выключить микрофон | `type=button; aria-label=Выключить микрофон` |
| 320 | button: Завершить разговор | `type=button; @click=v.toggleVoice` |
| 338 | button: button | `type=button; @click=v.toggleMute` |
| 341 | button: Завершить звонок | `type=button; @click=v.endCall; aria-label=Завершить звонок` |
| 355 | button: × | `type=button; @click=v.closeDb; aria-label=Закрыть` |
| 363 | img: img | `нет адреса/обработчика` |
| 365 | button: button | `type=button; @click=it.toggle` |
| 379 | script: script | `src=petite-vue.iife.js` |
| 380 | script: script | `src=dc-lite.js` |
| 381 | script: script | `нет адреса/обработчика` |

JS: переходы, fetch, динамические действия (строка: код):

```text
432: const demo = await fetch('../demo/cash_gap.csv', { signal: controller.signal });
443: const response = await fetch('/api/score', { method: 'POST',
482: pick: () => { this.setState({ skill: k.id }); this.ask(k.title + ': помоги'); }
491: const dbGroups = dbRaw.map(g => ({ name: g.name, items: g.items.map(it => { const on = !off[it.id]; return Object.assign({}, it, { on: on ? 'true' : 'false', track: on ? '#13a463' : '#dcdcdd', knob: on ? '23px' : '3px', toggle: () => this.setState(s => ({ off: Object.assign({}, s.off, { [it.id]: on }) })) }); }) }));
514: chips: (st === 'empty' ? startChips : nextChips).map(label => ({ label, pick: () => this.ask(label) })),
517: clearSkill: () => this.setState({ skill: null }),
528: toggleMute: () => this.setState(s => ({ mute: !s.mute })),
529: startCall: () => this.startCall(), endCall: () => this.endCall(),
531: openDb: () => this.setState({ db: true }), closeDb: () => this.setState({ db: false }),
532: toggleVoice: () => this.setState(s => ({ voice: !s.voice })),
533: upload: () => this.upload(),
534: selectFile: event => this.selectFile(event),
535: demoUpload: () => this.scoreStatement(),
537: retryUpload: () => this.scoreStatement(this.lastFile),
538: reset: () => this.reset()
```

### /v2/index.html

| Строка | Элемент / текст | Переход, ресурс или действие |
|---|---|---|
| 7 | link: link | `href=https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap` |
| 43 | img: img | `src=img/alfa.svg` |
| 46 | a: Главная | `href=index.html` |
| 46 | a: Кредитный кабинет | `href=kabinet.html` |
| 46 | a: ИИ-агент | `href=chat.html` |
| 46 | a: Подбор | `href=podbor.html` |
| 48 | button: Уведомления, 3 новых | `type=button; aria-label=Уведомления, 3 новых` |
| 52 | button: Профиль | `type=button; aria-label=Профиль` |
| 65 | a: a | `href=chat.html` |
| 66 | img: img | `нет адреса/обработчика` |
| 68 | button: {{ v.moreLabel }} | `type=button; @click=v.toggleMore` |
| 72 | a: Попробовать бесплатно | `href=chat.html` |
| 73 | a: ЦФАДеньги от инвесторов, без кредита | `href=#cfa` |
| 122 | a: Открыть кредитный кабинет | `href=kabinet.html` |
| 128 | a: Ближайший платёж {{ v.nPay }} ₽17 ноября · денег хватает | `href=kabinet.html` |
| 133 | a: Лента бизнеса3 новых {{ f.title }}{{ f.when }} | `href=kabinet.html` |
| 143 | a: Погашено{{ v.nPct }}%8 из 36 платежей | `href=kabinet.html` |
| 148 | a: Остаток до платежа1 155 429 ₽ | `href=kabinet.html` |
| 153 | a: Лимит после шага +{{ v.nLimit }} ₽подтвердите договор | `href=chat.html` |
| 158 | a: На счетах сегодня {{ v.nCash }} ₽ | `href=kabinet.html` |
| 164 | a: Налоги | `href=chat.html` |
| 165 | img: img | `src=img/skill-nalogi.svg` |
| 169 | a: Вам должны | `href=chat.html` |
| 170 | img: img | `src=img/feed-postuplenie.svg` |
| 174 | a: Запас по платежам3,67× рискпорог банка 1,25спокойно | `href=kabinet.html` |
| 186 | a: {{ f.title }} {{ f.when }} | `href=kabinet.html` |
| 197 | script: script | `src=petite-vue.iife.js` |
| 198 | script: script | `src=dc-lite.js` |
| 199 | script: script | `нет адреса/обработчика` |

JS: переходы, fetch, динамические действия (строка: код):

```text
221: toggleMore: () => this.setState(st => ({ more: !st.more })), moreOpen: this.state.more ? 'true' : 'false', moreLabel: this.state.more ? 'Свернуть' : 'Ещё 6',
```

### /v2/kabinet.html

| Строка | Элемент / текст | Переход, ресурс или действие |
|---|---|---|
| 7 | link: link | `href=https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap` |
| 42 | img: img | `src=img/alfa.svg` |
| 45 | a: Главная | `href=index.html` |
| 45 | a: Кредитный кабинет | `href=kabinet.html` |
| 45 | a: ИИ-агент | `href=chat.html` |
| 45 | a: Подбор | `href=podbor.html` |
| 46 | button: Уведомления, 3 новых | `type=button; aria-label=Уведомления, 3 новых` |
| 82 | button: {{ t.label }} | `type=button; @click=t.pick` |
| 91 | img: img | `нет адреса/обработчика` |
| 103 | button: Обсудить | `type=button; @click=f.discuss` |
| 104 | button: button | `type=button; @click=f.toggle` |
| 114 | button: {{ p.date }} долг {{ p.debt }} · проценты {{ p.pct }} {{ p.sum }} {{ p.state }} | `type=button; @click=p.open` |
| 127 | button: Назад к платежам | `type=button; @click=v.backToPayments; aria-label=Назад к платежам` |
| 129 | button: Обсудить с агентом | `type=button; @click=v.discussPayment` |
| 137 | button: Базовый прогноз | `type=button; @click=v.setBase` |
| 138 | button: Поступления −30% | `type=button; @click=v.setStress` |
| 169 | a: Открыть чат целиком | `href=chat.html` |
| 175 | button: × | `type=button; @click=v.clearContext; aria-label=Открепить` |
| 195 | button: {{ c.label }} | `type=button; @click=c.pick` |
| 202 | input: kmsg | `id=kmsg; type=text` |
| 203 | button: Надиктовать | `type=button; aria-label=Надиктовать` |
| 204 | button: Отправить | `type=button; aria-label=Отправить` |
| 212 | script: script | `src=petite-vue.iife.js` |
| 213 | script: script | `src=dc-lite.js` |
| 214 | script: script | `нет адреса/обработчика` |

JS: переходы, fetch, динамические действия (строка: код):

```text
235: return { label, bg: on ? '#0b0b0c' : '#ffffff', ink: on ? '#ffffff' : '#6b6b70', border: on ? '#0b0b0c' : '#dcdcdd', pick: () => this.setState({ tab: id }) };
243: const feed = feedDefs.map((f, i) => { const open = this.state.open === f.id; return Object.assign({}, f, { delay: (i * 90) + 'ms', isOpen: open, rot: open ? '180deg' : '0deg', toggleLabel: open ? 'Свернуть' : 'Подробнее', toggle: () => this.setState({ open: open ? null : f.id }), discuss: () => this.discuss(f.title, f.reply) }); });
250: const payments = payDefs.map(p => Object.assign({}, p, { open: () => this.setState({ tab: 'payment' }) }));
256: backToPayments: () => this.setState({ tab: 'payments' }),
257: discussPayment: () => this.discuss('Платёж 17 ноября', 'Платёж 114 571 ₽: долг 68 890 ₽ и проценты 45 681 ₽. ' + (st ? 'При −30% поступлений после платежа останется около 760 000 ₽.' : 'После платежа останется 1 155 429 ₽.') + ' Отложить часть заранее?'),
264: setBase: () => this.setState({ stress: false }), setStress: () => this.setState({ stress: true }),
272: clearContext: () => this.setState({ context: null }),
274: agentChips: ['Что важнее всего сегодня', 'Можно досрочно погасить?', 'Сколько отложить на платёж'].map(label => ({ label, pick: () => this.discuss(label, 'Секунду, посчитаю по выписке и графику платежей. [ответ ядра]') }))
```

### /v2/karta.html

| Строка | Элемент / текст | Переход, ресурс или действие |
|---|---|---|
| 7 | link: link | `href=https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap` |
| 110 | script: script | `src=petite-vue.iife.js` |
| 111 | script: script | `src=dc-lite.js` |
| 112 | script: script | `нет адреса/обработчика` |

JS: переходы, fetch, динамические действия (строка: код):

```text
```

### /v2/podbor.html

| Строка | Элемент / текст | Переход, ресурс или действие |
|---|---|---|
| 7 | link: link | `href=https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap` |
| 42 | img: img | `src=img/alfa.svg` |
| 45 | a: Главная | `href=index.html` |
| 45 | a: Кредитный кабинет | `href=kabinet.html` |
| 45 | a: ИИ-агент | `href=chat.html` |
| 45 | a: Подбор | `href=podbor.html` |
| 46 | button: Уведомления, 3 новых | `type=button; aria-label=Уведомления, 3 новых` |
| 61 | button: {{ c.n }}{{ c.label }} | `type=button; @click=c.go` |
| 70 | button: button | `type=button; @click=g.pick` |
| 71 | img: img | `нет адреса/обработчика` |
| 82 | button: Дальше: сумма и срок | `type=button; @click=v.toAmount` |
| 93 | input: amt | `id=amt; type=range; @input=v.setAmount` |
| 100 | button: {{ t.label }} | `type=button; @click=t.pick` |
| 108 | button: {{ r.label }} | `type=button; @click=r.pick` |
| 125 | button: Подобрать | `type=button; @click=v.runCalc` |
| 148 | a: Обсудить с агентом | `href=chat.html` |
| 197 | button: Сделаю | `type=button; @click=v.doStep` |
| 211 | button: button | `type=button; @click=a.toggle` |
| 212 | img: img | `нет адреса/обработчика` |
| 218 | a: {{ a.action }} | `href=chat.html` |
| 237 | button: Изменить параметры | `type=button; @click=v.toAmount` |
| 238 | a: Обсудить с агентом | `href=chat.html` |
| 240 | a: Перейти к оформлению | `href=#` |
| 250 | script: script | `src=petite-vue.iife.js` |
| 251 | script: script | `src=dc-lite.js` |
| 252 | script: script | `нет адреса/обработчика` |

JS: переходы, fetch, динамические действия (строка: код):

```text
338: goals: goalDefs.map(([id, label, hint, img], i) => { const on = s.goal === id; return { label, hint, img, pressed: on ? 'true' : 'false', border: on ? '#ef3124' : '#dcdcdd', bg: on ? '#fffafa' : '#ffffff', delay: (i * 60) + 'ms', pick: () => this.setState({ goal: id, done: false }) }; }),
339: toAmount: () => this.setState({ step: 'amount' }),
341: setAmount: (e) => this.setState({ amount: Number(e.target.value), done: false }),
342: terms: [6, 12, 18, 24, 36].map(t => { const on = s.term === t; return { label: t + ' мес', pressed: on ? 'true' : 'false', bg: on ? '#0b0b0c' : '#ffffff', ink: on ? '#ffffff' : '#0b0b0c', border: on ? '#0b0b0c' : '#dcdcdd', pick: () => this.setState({ term: t }) }; }),
343: rets: [['contract', 'Оплата по договору'], ['revenue', 'Обычная выручка'], ['other', 'Другое']].map(([id, label]) => { const on = s.ret === id; return { label, pressed: on ? 'true' : 'false', bg: on ? '#0b0b0c' : '#ffffff', ink: on ? '#ffffff' : '#0b0b0c', border: on ? '#0b0b0c' : '#dcdcdd', pick: () => this.setState({ ret: id }) }; }),
346: runCalc: () => this.runCalc(),
364: doStep: () => { if (stepTitle.indexOf('срок') > -1) { this.setState({ term: 12 }); } else { this.setState({ done: true }); } this.countUp(); },
373: alts: altDefs.map(a => { const open = s.open === a.id; return Object.assign({}, a, { isOpen: open, expanded: open ? 'true' : 'false', rot: open ? '180deg' : '0deg', toggle: () => this.setState({ open: open ? null : a.id }) }); })
```

### /v2/zagruzka.html

| Строка | Элемент / текст | Переход, ресурс или действие |
|---|---|---|
| 7 | link: link | `href=https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap` |
| 53 | img: img | `src=img/alfa.svg` |
| 64 | img: img | `src=img/push.png` |
| 172 | button: button | `type=button; @click=d.pick` |
| 202 | script: script | `src=petite-vue.iife.js` |
| 203 | script: script | `src=dc-lite.js` |
| 204 | script: script | `нет адреса/обработчика` |

JS: переходы, fetch, динамические действия (строка: код):

```text
247: dots: scenes.map((s, i) => ({ label: s.title, w: i === this.state.scene ? '32px' : '10px', c: i === this.state.scene ? '#ef3124' : '#dcdcdd', pick: () => this.setState({ scene: i }) })),
```

### /zagruzka.html

| Строка | Элемент / текст | Переход, ресурс или действие |
|---|---|---|
| 7 | link: link | `href=https://fonts.googleapis.com` |
| 8 | link: link | `href=https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap` |
| 9 | link: link | `href=site.css` |
| 29 | a: Альфа-Банк Бизнес | `href=/` |
| 34 | a: Подбор финансирования | `href=anketa.html` |
| 35 | a: Кредитный кабинет | `href=kabinet.html` |
| 36 | a: Аналитика | `href=/#features` |
| 37 | a: О продукте | `href=/#features` |
| 39 | a: Профиль | `href=#; aria-label=Профиль` |
| 44 | img: img | `src=img/push.png` |
| 48 | script: script | `нет адреса/обработчика` |

JS: переходы, fetch, динамические действия (строка: код):

```text
50: setTimeout(() => { location.href = 'kabinet.html?tour=1'; }, 2600);
```

## Толя: маршруты SPA

| URL | Экран / переходы |
|---|---|
| `/` | Landing: демо `/demo`, регистрация `/onboarding`, вход `/login` |
| `/demo` | DemoPage: публичные ooo/ip/idea, расчёт, переход к регистрации |
| `/onboarding` | Onboarding: анкета, телефон, пароль, регистрация -> `/cabinet` |
| `/login` | Вход -> `/cabinet` |
| `/cabinet` | WorkspaceView/CabinetV2: кредит, график, план, показатели, обсуждение с агентом |
| `/cabinet-v2`, `/efficiency` | cabinetRoute нормализует в `/cabinet` через replaceState |
| `/profile` | Profile: сведения/ИНН/подтверждение, документы/извлечение/подтверждение/скачивание |
| `/financing` | Financing: цель/сумма/срок/источник/финансы, подбор mvp-2, версии, превью/согласие/демо-заявка, чат |
| `/chat` | Chat: новый/история/переименование, сообщения, документы, предложения к подтверждению |
| Другой путь | App показывает WorkspaceView для авторизованного, форму входа для гостя; отдельного 404 нет |

Внутренняя навигация вызывает history.pushState; Назад/Вперёд обрабатывает popstate. Закрытые страницы показывают форму входа гостю, закрытые API обязаны возвращать 401. Шапка: кабинет/чат/подбор/профиль, уведомления, обучение, выход, мобильное меню. Обращение сотруднику сохраняет локальную запись.

## Толя: сценарии от лендинга

1. Лендинг -> демо: выбрать ООО/ИП/идея -> менять сумму/срок -> публичный расчёт -> регистрация. Демо-вход `/auth/demo` создаёт отдельного пользователя.
2. Регистрация: профиль и телефон/пароль -> cookie -> state -> кабинет -> обучение -> preferences.tourDone. Выход инвалидирует cookie; повторный вход восстанавливает профиль.
3. Профиль: lookup найденного/не найденного/ликвидированного/кривого ИНН -> свежий lookup/confirm -> ручная корректировка; файлы fixtures -> multipart documents -> проверка извлечённых полей -> confirm -> download. egr-mock.json не документ, это справочник мока.
4. Подбор: financing/context -> ввод fundingInput -> selections engine=mvp-2 -> версия 1 -> изменение с parentId и expectedVersion -> версия 2 того же id -> application-preview -> подтверждение рисков, если требуется -> application с expectedVersion -> сохранённая демо-заявка -> state/уведомление/досье. Устаревшая версия даёт 409, повтор подачи той же версии возвращает прежний lead.
5. Кабинет: без кредита -> no-credit; либо facility с ручными параметрами/подтверждённым schedule -> платежи -> payment; plan задаёт остаток/датированные потоки; coverage задаёт CFADS/методику; discuss закрепляет серверный snapshot в диалоге. Старый credit/demo создаёт отдельную структуру credit; это не полный сценарий нового кабинета.
6. Чат: POST chats -> PATCH title -> пять POST messages по порядку -> state содержит пары user/assistant. TeamAgentProvider -> services/agent POST /turn, тело history, statement_csv/need/card по сборке провайдера; ответ text/mode. Без агента демонстрационные ответы не считаются успешным тестом LLM. Чужие chat id при PATCH/messages должны дать 404.

## Толя: API app.ts и funding-routes.ts

Тело JSON, кроме documents (multipart). Public без cookie; session означает cookie alfa_session. На всех изменениях проверяется Origin, если передан. Все закрытые маршруты находятся после session middleware. Для чисел требуется конечное число, не строка.

| Метод / путь | Auth | Тело / параметры |
|---|---|---|
| GET /api/config | public | нет; authenticated, workspaceId, aiConnected, fieldNames, catalog |
| GET /health, /api/health | public | нет; SQLite и TEAM_API_URL /health |
| GET /api/public-demo | public | query kind=ooo/ip/idea, default ooo |
| POST /api/public-demo/calculate | public | kind, amount 10000..1e8, term 1..120 |
| POST /api/auth/register | public | phone: 7+10 цифр; password 8..128; profile: name?, form enum, stage operating/planning, sector, registered bool, ageBand, result, debt, intent, preparation? |
| POST /api/auth/login | public | phone, password |
| POST /api/auth/demo | public | kind? ooo/ip/idea |
| POST /api/auth/logout | public | {}; инвалидирует сессию |
| GET /api/state | session | нет; AppState |
| PATCH /api/profile | session | name?, sector?, activity?, region?, ageBand?, result?, debt?, intent?; strict |
| PATCH /api/preferences | session | split? 40..75, tourDone? bool |
| POST /api/lookup | session | inn 10/12 цифр; mock 9900000001 ACTIVE, 9900000002 LIQUIDATED, ИП 990000000001/2; неизвестный 404 |
| POST /api/lookup/confirm | session | inn совпадает с последним lookup, TTL 10 минут; профиль берётся с сервера |
| POST /api/documents | session | multipart file один <=8 MiB, category?; csv/pdf/xlsx/docx поддерживаемого шаблона |
| POST /api/documents/:id/confirm | session | {}; id из документов текущего пользователя |
| GET /api/documents/:id/download | session | нет; binary, files WHERE user_id |
| GET /api/financing/context | session | нет; data, catalog |
| POST /api/selections (funding) | session | engine=mvp-2, input=fundingInput, parentId?, expectedVersion?; strict; обновляет прежний id |
| GET /api/selections/:id/application-preview | session | нет; application, needsAcknowledgement |
| POST /api/selections/:id/application | session | expectedVersion positive int, acknowledgeRisks? bool default false |
| POST /api/chats | session | selectionId?; проверяется принадлежность; для подбора повторно возвращает прежний чат |
| PATCH /api/chats/:id | session | title 1..80 |
| POST /api/chats/:id/messages | session | text trim 1..4000; один активный ответ на пользователя |
| POST /api/financials | session | field incoming/expenses/freeFlow/existing/balance, value 0..1e9 |
| POST /api/selections (legacy fallback) | session | без engine=mvp-2: purpose, amount, term, flow nullable, existing nullable, repayFrom?, parentId?; создаёт новый id |
| POST /api/leads | session | selectionId, phone; legacy, без expectedVersion/acknowledgeRisks |
| POST /api/consultations | session | phone, note trim 5..1000; локальная запись |
| GET /api/dossier/:id | session | нет; текущий подбор/профиль/подтверждённые документы/финансы, attachment JSON |
| POST /api/credit/demo | session | {}; синтетический legacy-кредит |
| POST /api/forecast-assumptions | session | balance, incoming, expenses 0..1e9; strict |
| POST /api/credit/forecast | session | stress bool; требует legacy credit |
| POST /api/notifications/read | session | id?; без id читает все |
| POST /api/team-score | session | statement_csv <=500000 символов, need object, questionnaire object, confirmed_fields? object -> TEAM_API_URL /score; timeout 30s |
| ANY /api/* неизвестный | session | 404 JSON после auth; гость 401 |

fundingInput (`server/funding-engine.ts:21`): purpose из 9 fundingPurposes, amount 10000..1e12, term 1..120 или null, needed urgent/month/later/date, neededDate?, usage once/parts/regular, description <=1000, repayFrom 1..300, productId? working/investment/contract/overdraft/refinance, cycleDays 1..90, details record(string/number/bool/null), financials {incoming?, expenses?, existing?, available?, flow?, changes?}. Даты проверяются дополнительно, отрицательные details (кроме effect) запрещены.

### API подключённого cabinetRouter (все session)

| Метод / путь | Тело |
|---|---|
| GET /api/cabinet | нет, snapshot |
| POST /api/cabinet/no-credit | {} |
| POST /api/cabinet/facility | name, amount>0, balance>=0, rate 0..100, term 1..120, firstDate; issuedDate?, contractTerm?, documentId? подтверждённого schedule |
| POST /api/cabinet/payment | id, status paid/overdue, recordedDate, source 5..180 |
| POST /api/cabinet/plan | balance, balanceDate (последние 7 дней), through (будущее <=90 дней), source, items[{date,amount,label}] <=100 |
| POST /api/cabinet/coverage | amount, start, end (период <=367 дней), source, methodology 20..800 |
| POST /api/cabinet/discuss | chatId?; серверный snapshot |

## Запуск и границы проверки

```sh
node tests/e2e/main_site.mjs --base https://your-main-host
node tests/e2e/tolya_site.mjs --base http://127.0.0.1:4180
```

Оба теста выводят OK/FAIL и TOTAL; при FAIL exit 1. Каждый HTTP-запрос имеет timeout, включая чтение тела. main_site берёт перечень всех HTML/CSV из локального checkout, а содержимое по --base; проверяет href/src, MIME, якоря и CSS url. POST score: все demo CSV и шесть негативных тел. Размерный негатив содержит 6 MiB наполнителя плюс JSON-обёртку, то есть пересекает лимит 6 MiB.

tolya_site создаёт два e2e-пользователя, не удаляет данные, проверяет все шаблоны документов из fixtures (кроме реестра JSON), основной mvp-2 путь/версии/заявку, профиль, кабинет, пять реплик, изоляцию и все закрытые API без cookie. Телефоны синтетические случайные, имя содержит e2e; после lookup имя восстановлено. Наличие HTML shell не подтверждает рендер React. Успешный HTTP при mode demo/agent-offline не проходит проверку агента. Для чата нужен настроенный TEAM_AGENT_URL; без него полный прогон закономерно FAIL.

Ручной прогон: реальные клики/disabled/валидация форм, обновление на каждом SPA URL, история/мобильное меню, drag-drop, отмена/повтор загрузки, одновременные вкладки, версии после повторного входа, недоступность upstream. Тест создаёт facility/plan/coverage и snapshot обсуждения нового кабинета, отдельно проверяет legacy credit/demo и прокси team-score. Отметку платежа с допустимыми датами проверить вручную: тест не ждёт наступления даты будущего платежа.

### Динамические кнопки основного разговора

- Цель: Оборудование / Сезон / Рост / Закупка под контракт / Кассовый разрыв -> purpose -> сумма.
- Сумма: 500 000 / 1 500 000 / 3 000 000 -> amount_rub -> срок; свободный ввод разбирается money.
- Срок: 6 / 12 / 24 / 36 мес -> term_months -> источник.
- Источник: Из оплаты по договору -> сумма договора; Из текущей выручки / Из сезонной выручки -> выписка.
- Договор: 1 440 000 на 12 мес -> contract_with_main_customer со слов -> выписка; Договора пока нет -> выписка.
- Демо: Кровельщик -> GET demo/cash_gap.csv; Мебельный цех -> equipment_leasing.csv; Садовый центр -> seasonal_ok.csv; Кофейня -> no_cashflow.csv. Каждый после загрузки вызывает POST /api/score. Демо не меняет анкету пользователя.
- Сделаю из next_steps -> doStep: подтверждение contract_main_customer и повтор score; для других кодов пояснение об ограничении прототипа.
- Загрузить другой файл -> askStatement; Повторить -> score; Позвать менеджера -> dialog; Начать заново -> anketa.html.

### Точные fetch основного сайта

| Страница:строка | Запрос | Тело / ответ |
|---|---|---|
| razgovor.html:333 | GET demo/${d.file}.csv | текст CSV |
| razgovor.html:366 | POST /api/score | statement_csv, need, questionnaire, confirmed_fields, history; JSON core/view, AbortController |
| v2/chat.html:432 | GET ../demo/cash_gap.csv | текст CSV, общий timeout 35 s |
| v2/chat.html:443 | POST /api/score | CSV файла/демо, фиксированные need/questionnaire, пустые confirmed_fields/history; JSON core/view |

Часы, анимации и карта путей работают локально. Актуальные провода v2-чата и агента перечислены ниже.

## Полный e2e-прогон (20.10.2026)

```sh
node tests/e2e/run_all.mjs --main http://127.0.0.1 --tolya http://127.0.0.1:4173
node tests/e2e/agent_live.mjs --base http://127.0.0.1:4173
```

Node 24, только stdlib. run_all последовательно запускает main_site, tolya_site и agent_live;
собирает OK/FAIL/WARN и пишет `tests/e2e/REPORT.md`: UTC-даты, адреса, итоги,
каждый FAIL со шагом и ответом сервера до 300 символов, без cookie и паролей.
FAIL даёт exit 1, только WARN — exit 0. `--help` не использует сеть и не создаёт отчёт.
Живой прогон выполняется архитектором; синтаксис и help не доказывают доступность стенда.

| Откуда / метод / путь | Провод, тело и проверка |
|---|---|
| v2 chat, POST `/agent/turn` (не под /api: Caddy отдаёт /api/* в Go) | nginx: только POST, тело до 64 KiB; rewrite в `/turn` на `agent:8090`; session_id, text, questionnaire; 200 JSON с непустым text |
| GET `/agent/turn` (не под /api: Caddy отдаёт /api/* в Go) | nginx возвращает 405 |
| Основной сайт, GET `/api/health` | nginx → api:8080/health → ядро; 200 JSON status=ok |
| Основной сайт, POST `/api/score` | nginx → api:8080/score → ml-model:5000/score; demo CSV → 200 core/view |
| Толя, POST `/api/auth/register` | phone, password, profile; синтетическая учётка e2e, cookie alfa_session остаётся только в памяти процесса |
| Толя, POST `/api/chats` | {}; новый пустой чат; следующий чат той же учётки проверяет память клиента |
| Толя, POST `/api/chats/:id/messages` | {text}; ответ — state.chats[id].messages, последняя assistant.text и mode=team-agent; TEAM_AGENT_URL → agent:8090/turn |
| Агент, POST `/turn` (внутри compose) | session_id — разговор, client_id — пользователь сайта; sessions и clients в agent_state; без client_id нет памяти между чатами |
| Агент, GET `/health` (внутри compose) | healthcheck compose; напрямую наружу agent не опубликован |
| Толя, POST `/api/team-score` | TEAM_API_URL → api:8080 → ядро; B12: годовая cash_gap.csv (>100 KiB) → 200 core/view/decision_id; тело >2 MiB → 413 JSON error |

main_site сохраняет обход всех локальных v1/v2 HTML и внутренних href/src с HTTP 200,
MIME и якорями; отдельно проверяет ссылку оформления в v2/podbor.html: есть назначение,
href не равен `#`. Проверка через HTTP не исполняет обработчики интерфейса.

agent_live создаёт отдельную синтетическую учётку и проверяет три хода про миллион на
плитку, оплату заказчиком через 60 дней и срок 8 месяцев: без повторных вопросов о
цели/сумме, к третьему ходу запрос выписки. Затем новый чат проверяет память о плитке
или миллионе; отдельные чаты — честное «ИИ», отсутствие цифр паспорта в ответе и
отсутствие «одобрен» после инъекции. Время каждого отправленного хода печатается;
свыше 30 секунд — WARN. Ответы сверяются с текущими заготовками dialog.py
(включая QUESTIONS, RETRY_QUESTIONS и составные подтверждения) и explain_templates.py.
Все ответы на заготовках → FAIL «LLM не включён: агент на заготовках».
Отличие от заготовок — наблюдаемый признак, а не доказательство вызова LLM по телеметрии.
Данные на сервере не удаляются. Для tolya_site нужен EGR_PROVIDER=mock.
