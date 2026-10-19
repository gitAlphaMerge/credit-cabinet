# E2E REPORT

Дата начала (UTC): 2026-10-19T22:25:21.599Z
Дата окончания (UTC): 2026-10-19T22:28:19.395Z
Основной сайт: https://158-160-212-36.sslip.io/
Сайт Толи: http://158.160.212.36:4173/

| Набор | Итог | OK | FAIL | WARN |
|---|---|---:|---:|---:|
| main_site | FAIL | 208 | 6 | 0 |
| tolya_site | OK | 102 | 0 | 0 |
| agent_live | WARN | 12 | 0 | 2 |

## FAIL

| Набор | Шаг | Ошибка | Ответ сервера (до 300 символов) |
|---|---|---|---|
| main_site | zagruzka.html src img/push.png | HTTP 404 https://158-160-212-36.sslip.io/img/push.png: &lt;html&gt; &lt;head&gt;&lt;title&gt;404 Not Found&lt;/title&gt;&lt;/head&gt; &lt;body&gt; &lt;center&gt;&lt;h1&gt;404 Not Found&lt;/h1&gt;&lt;/center&gt; &lt;hr&gt;&lt;center&gt;nginx/1.31.7&lt;/center&gt; &lt;/body&gt; &lt;/html&gt;  | HTTP 404: &lt;html&gt; &lt;head&gt;&lt;title&gt;404 Not Found&lt;/title&gt;&lt;/head&gt; &lt;body&gt; &lt;center&gt;&lt;h1&gt;404 Not Found&lt;/h1&gt;&lt;/center&gt; &lt;hr&gt;&lt;center&gt;nginx/1.31.7&lt;/center&gt; &lt;/body&gt; &lt;/html&gt;  |
| main_site | zagruzka.html generated asset img/push.png | HTTP 404 https://158-160-212-36.sslip.io/img/push.png: &lt;html&gt; &lt;head&gt;&lt;title&gt;404 Not Found&lt;/title&gt;&lt;/head&gt; &lt;body&gt; &lt;center&gt;&lt;h1&gt;404 Not Found&lt;/h1&gt;&lt;/center&gt; &lt;hr&gt;&lt;center&gt;nginx/1.31.7&lt;/center&gt; &lt;/body&gt; &lt;/html&gt;  | HTTP 404: &lt;html&gt; &lt;head&gt;&lt;title&gt;404 Not Found&lt;/title&gt;&lt;/head&gt; &lt;body&gt; &lt;center&gt;&lt;h1&gt;404 Not Found&lt;/h1&gt;&lt;/center&gt; &lt;hr&gt;&lt;center&gt;nginx/1.31.7&lt;/center&gt; &lt;/body&gt; &lt;/html&gt;  |
| main_site | anchor /v2/index.html#cfa | missing id/name cfa | нет ответа сервера |
| main_site | v2 agent POST through nginx | HTTP 404: 404 page not found  | HTTP 404: 404 page not found  |
| main_site | v2 agent GET through nginx | expected 405, got 404 | HTTP 404: 404 page not found  |
| main_site | negative bad CSV | HTTP 431, non-JSON: 431 Request Header Fields Too Large | HTTP 431: 431 Request Header Fields Too Large |

## WARN

- agent_live: a/2 template: ответ совпадает с заготовкой
- agent_live: c passport privacy template: ответ совпадает с заготовкой

HTTP-проверки не исполняют JavaScript браузера. Синтетические учётки и демо-данные остаются на сервере.
Cookie и пароли в отчёт не записываются.
