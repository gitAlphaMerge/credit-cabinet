# G4: типографика и читаемость цифр

## Было

Замер до изменения CSS и TSX, 24.10.2026: 823 разрешённых размера, 393 ниже 12 px, 73 пары цветов ниже 4,5:1 из 112 измеримых пар. Всего 466 нарушений. Одна относительная величина 0.9em требовала вычисленного стиля. В styles.css размеры 7-12 px встречались 263 раза: 9 + 39 + 45 + 56 + 71 + 43; дополнительно найден один размер 6 px. По всем восьми CSS минимум достигал 5 px.

Ошибка числового формата доказана до исправления реальным рендером CalculationView:

```text
node --import ./tests/qa/q3-loader.ts --test --test-name-pattern='calculation displays' tests/qa/g4-type.test.ts
AssertionError [ERR_ASSERTION]: Демо-ставка</small><strong>21.5%</strong>
tests 1; pass 0; fail 1
```

База QA до правок: tests 165; pass 165; fail 0. TypeScript проходил через npx.cmd, иконки 38/38. npm.cmd test до правок не запускался: uv_os_get_passwd returned ENOMEM. Обычные npm/npx в PowerShell также блокируются ExecutionPolicy, поэтому ниже применяются npm.cmd/npx.cmd без изменения системных настроек.

Полный исходный прогон node scripts/check-type.mjs, exit 1:

```text
CSS files: 8; font sizes: 823
Font size histogram (clamp = minimum, rem at 16px root):
5px: 1
6px: 1
7px: 9
8px: 47
9px: 79
10px: 109
11px: 147
12px: 140
13px: 70
14px: 36
15px: 15
16px: 11
17px: 15
18px: 13
19px: 4
20px: 10
21px: 7
22px: 8
23px: 6
24px: 12
25px: 11
26px: 11
27px: 12
28px: 4
29px: 11
30px: 4
31px: 4
32px: 11
33px: 2
34px: 1
35px: 1
36px: 1
37px: 1
38px: 1
39px: 1
42px: 2
43px: 1
54px: 1
57px: 1
59px: 1
65px: 1
SIZE src/styles.css:241 .brand small = 8px (8px)
SIZE src/styles.css:255 .badge = 11px (11px)
SIZE src/styles.css:271 .eyebrow = 10px (10px)
SIZE src/styles.css:362 .fine-print = 11px (11px)
SIZE src/styles.css:469 .hero-meta = 11px (11px)
SIZE src/styles.css:523 .card-top = 11px (11px)
SIZE src/styles.css:539 .hero-chart-title small = 11px (11px)
SIZE src/styles.css:570 .chart-labels = 10px (10px)
SIZE src/styles.css:578 .visual-card-bottom = 9px (9px)
SIZE src/styles.css:612 .visual-chip b = 11px (11px)
SIZE src/styles.css:617 .visual-chip small = 9px (9px)
SIZE src/styles.css:637 .visual-caption = 9px (9px)
SIZE src/styles.css:666 .benefit-strip p = 11px (11px)
SIZE src/styles.css:710 .feature-number = 9px (9px)
SIZE src/styles.css:742 .comparison-mini > div:first-child = 10px (10px)
SIZE src/styles.css:749 .comparison-mini > div:first-child b = 11px (11px)
SIZE src/styles.css:773 .mini-metrics = 9px (9px)
SIZE src/styles.css:779 .mini-metrics b = 10px (10px)
SIZE src/styles.css:835 .files-preview > div = 11px (11px)
SIZE src/styles.css:961 .final-cta .eyebrow = 9px (9px)
SIZE src/styles.css:972 .public-footer p = 10px (10px)
SIZE src/styles.css:1000 .onboard-progress = 11px (11px)
SIZE src/styles.css:1091 .answer small = 11px (11px)
SIZE src/styles.css:1116 .compact .answer b = 11px (11px)
SIZE src/styles.css:1121 .compact .answer-icon = 9px (9px)
SIZE src/styles.css:1186 .demo-switch > button = 11px (11px)
SIZE src/styles.css:1253 .company-button = 11px (11px)
SIZE src/styles.css:1271 .demo-ribbon = 9px (9px)
SIZE src/styles.css:1309 .page-intro .eyebrow = 9px (9px)
SIZE src/styles.css:1324 .intro-note b = 11px (11px)
SIZE src/styles.css:1330 .intro-note small = 10px (10px)
SIZE src/styles.css:1377 .workspace-footer = 10px (10px)
SIZE src/styles.css:1390 .page-heading .eyebrow = 9px (9px)
SIZE src/styles.css:1433 .notification-panel .text-button = 10px (10px)
SIZE src/styles.css:1455 .notice small = 11px (11px)
SIZE src/styles.css:1462 .notice time = 9px (9px)
SIZE src/styles.css:1547 .empty-benefits = 10px (10px)
SIZE src/styles.css:1575 .demo-load b = 10px (10px)
SIZE src/styles.css:1580 .demo-load small = 9px (9px)
SIZE src/styles.css:1587 .demo-load > .text-button = 10px (10px)
SIZE src/styles.css:1605 .credit-amount small = 11px (11px)
SIZE src/styles.css:1619 .progress-label = 10px (10px)
SIZE src/styles.css:1647 .credit-params small = 9px (9px)
SIZE src/styles.css:1665 .credit-details > summary = 11px (11px)
SIZE src/styles.css:1700 .payment-legend = 10px (10px)
SIZE src/styles.css:1739 .segmented > button = 10px (10px)
SIZE src/styles.css:1758 .forecast-card .fine-print = 9px (9px)
SIZE src/styles.css:1762 .forecast-card .text-button = 11px (11px)
SIZE src/styles.css:1770 .forecast-form .field = 11px (11px)
SIZE src/styles.css:1783 .agent-insight p = 11px (11px)
SIZE src/styles.css:1788 .agent-insight .text-button = 11px (11px)
SIZE src/styles.css:1844 .chat-header-title small = 9px (9px)
SIZE src/styles.css:1901 .chat-welcome p = 11px (11px)
SIZE src/styles.css:1908 .chat-welcome > .badge = 8px (8px)
SIZE src/styles.css:1925 .starter-prompts > button = 10px (10px)
SIZE src/styles.css:1960 .message-body = 11px (11px)
SIZE src/styles.css:1979 .message-body > time = 8px (8px)
SIZE src/styles.css:1984 .message-body > .badge = 8px (8px)
SIZE src/styles.css:1993 .proposal b = 11px (11px)
SIZE src/styles.css:1996 .proposal > .button = 10px (10px)
SIZE src/styles.css:2005 .thinking = 10px (10px)
SIZE src/styles.css:2044 .finance-chat-cta = 10px (10px)
SIZE src/styles.css:2071 .composer-row textarea = 11px (11px)
SIZE src/styles.css:2090 .composer > small = 8px (8px)
SIZE src/styles.css:2114 .chat-history > .button = 11px (11px)
SIZE src/styles.css:2120 .chat-history > .eyebrow = 8px (8px)
SIZE src/styles.css:2145 .chat-history b = 10px (10px)
SIZE src/styles.css:2151 .chat-history small = 8px (8px)
SIZE src/styles.css:2200 .expanded .composer > small = 9px (9px)
SIZE src/styles.css:2204 .profile-page > .text-button = 11px (11px)
SIZE src/styles.css:2243 .inn-search small = 8px (8px)
SIZE src/styles.css:2256 .inn-search .button = 10px (10px)
SIZE src/styles.css:2266 .profile-table > div = 11px (11px)
SIZE src/styles.css:2287 .onboard-facts > div = 11px (11px)
SIZE src/styles.css:2294 .onboard-facts b = 11px (11px)
SIZE src/styles.css:2358 .doc-status = 10px (10px)
SIZE src/styles.css:2366 .document-card > small = 9px (9px)
SIZE src/styles.css:2380 .file-name = 9px (9px)
SIZE src/styles.css:2397 .document-actions .button = 10px (10px)
SIZE src/styles.css:2402 .document-actions .text-button = 9px (9px)
SIZE src/styles.css:2405 .document-card > .text-button = 9px (9px)
SIZE src/styles.css:2415 .fixture-link = 8px (8px)
SIZE src/styles.css:2425 .template-link = 8px (8px)
SIZE src/styles.css:2435 .documents-panel > .fine-print = 9px (9px)
SIZE src/styles.css:2441 .profile-info > .panel-title .button = 11px (11px)
SIZE src/styles.css:2481 .page-tabs .badge = 8px (8px)
SIZE src/styles.css:2508 .financing-intro .button, .financing-intro .text-button = 11px (11px)
SIZE src/styles.css:2558 .float-label = 10px (10px)
SIZE src/styles.css:2617 .draft-status = 11px (11px)
SIZE src/styles.css:2625 .wizard-progress > span = 11px (11px)
SIZE src/styles.css:2628 .wizard-progress b = 10px (10px)
SIZE src/styles.css:2676 .purpose small = 10px (10px)
SIZE src/styles.css:2718 .selection-row small = 10px (10px)
SIZE src/styles.css:2723 .selection-row > .badge = 9px (9px)
SIZE src/styles.css:2744 .small-empty small = 11px (11px)
SIZE src/styles.css:2806 .calc-stats small = 10px (10px)
SIZE src/styles.css:2824 .calculation summary = 11px (11px)
SIZE src/styles.css:2832 .formula = 11px (11px)
SIZE src/styles.css:2849 .info-grid small = 9px (9px)
SIZE src/styles.css:2867 table = 11px (11px)
SIZE src/styles.css:2902 .result-analysis small = 10px (10px)
SIZE src/styles.css:2912 .result-analysis p = 11px (11px)
SIZE src/styles.css:2932 .result-risks p = 11px (11px)
SIZE src/styles.css:2956 .result-actions .button = 11px (11px)
SIZE src/styles.css:2980 .checkbox-row = 11px (11px)
SIZE src/styles.css:3012 .message-body .calc-stats small = 8px (8px)
SIZE src/styles.css:3016 .message-body .formula = 9px (9px)
SIZE src/styles.css:3023 .message-body table = 9px (9px)
SIZE src/styles.css:3030 .message-body .fine-print = 8px (8px)
SIZE src/styles.css:3107 .extracted-fields span = 10px (10px)
SIZE src/styles.css:3171 .tour-step .text-button = 11px (11px)
SIZE src/styles.css:3225 .app-header nav button = 11px (11px)
SIZE src/styles.css:3232 .company-button = 10px (10px)
SIZE src/styles.css:3260 .hero-meta = 9px (9px)
SIZE src/styles.css:3267 .benefit-strip b = 10px (10px)
SIZE src/styles.css:3270 .benefit-strip p = 9px (9px)
SIZE src/styles.css:3303 .empty-benefits = 9px (9px)
SIZE src/styles.css:3318 .chat-header-title b = 10px (10px)
SIZE src/styles.css:3321 .chat-header-title small = 8px (8px)
SIZE src/styles.css:3360 .public-header nav = 11px (11px)
SIZE src/styles.css:3434 .steps-grid p = 11px (11px)
SIZE src/styles.css:3562 .financing-benefits p = 11px (11px)
SIZE src/styles.css:3609 .public-header > .button = 11px (11px)
SIZE src/styles.css:3632 .hero-actions > .button = 11px (11px)
SIZE src/styles.css:3636 .hero-meta = 8px (8px)
SIZE src/styles.css:3660 .hero-chart-title small = 9px (9px)
SIZE src/styles.css:3663 .card-top = 9px (9px)
SIZE src/styles.css:3674 .visual-chip b = 9px (9px)
SIZE src/styles.css:3677 .visual-chip small = 8px (8px)
SIZE src/styles.css:3693 .visual-caption = 7px (7px)
SIZE src/styles.css:3697 .visual-card-bottom = 7px (7px)
SIZE src/styles.css:3700 .chart-labels = 8px (8px)
SIZE src/styles.css:3715 .benefit-strip b = 11px (11px)
SIZE src/styles.css:3718 .benefit-strip p = 10px (10px)
SIZE src/styles.css:3733 .eyebrow = 8px (8px)
SIZE src/styles.css:3786 .step-number = 10px (10px)
SIZE src/styles.css:3810 .trust-tags .badge = 9px (9px)
SIZE src/styles.css:3816 .faq details p = 11px (11px)
SIZE src/styles.css:3840 .public-footer p = 8px (8px)
SIZE src/styles.css:3863 .answer small = 10px (10px)
SIZE src/styles.css:3879 .onboarding .public-header > .text-button = 10px (10px)
SIZE src/styles.css:3889 .app-header .brand = 10px (10px)
SIZE src/styles.css:3893 .app-header .brand small = 6px (6px)
SIZE src/styles.css:3921 .company-button = 8px (8px)
SIZE src/styles.css:3936 .demo-ribbon = 7px (7px)
SIZE src/styles.css:3954 .page-intro p = 10px (10px)
SIZE src/styles.css:3959 .page-intro .eyebrow = 7px (7px)
SIZE src/styles.css:3974 .credit-empty > .panel-title .badge = 8px (8px)
SIZE src/styles.css:3987 .credit-empty > p = 11px (11px)
SIZE src/styles.css:3990 .credit-empty > .button = 11px (11px)
SIZE src/styles.css:3994 .empty-benefits = 8px (8px)
SIZE src/styles.css:4014 .demo-load b = 10px (10px)
SIZE src/styles.css:4017 .demo-load small = 8px (8px)
SIZE src/styles.css:4021 .demo-load > .text-button = 10px (10px)
SIZE src/styles.css:4029 .chat-header-title b = 11px (11px)
SIZE src/styles.css:4032 .chat-header-title small = 8px (8px)
SIZE src/styles.css:4050 .message-body = 11px (11px)
SIZE src/styles.css:4062 .page-heading p = 11px (11px)
SIZE src/styles.css:4066 .page-heading .eyebrow = 7px (7px)
SIZE src/styles.css:4072 .profile-info > .panel-title .button = 9px (9px)
SIZE src/styles.css:4094 .inn-search .button = 9px (9px)
SIZE src/styles.css:4099 .inn-search small = 7px (7px)
SIZE src/styles.css:4105 .profile-table > div = 10px (10px)
SIZE src/styles.css:4113 .onboard-facts > div = 10px (10px)
SIZE src/styles.css:4117 .onboard-facts b = 10px (10px)
SIZE src/styles.css:4127 .document-card h3 = 11px (11px)
SIZE src/styles.css:4131 .doc-status = 9px (9px)
SIZE src/styles.css:4134 .document-card > small = 8px (8px)
SIZE src/styles.css:4141 .document-actions .button = 9px (9px)
SIZE src/styles.css:4147 .document-actions .text-button = 8px (8px)
SIZE src/styles.css:4150 .file-name = 8px (8px)
SIZE src/styles.css:4158 .fixture-link = 7px (7px)
SIZE src/styles.css:4163 .template-link = 7px (7px)
SIZE src/styles.css:4169 .documents-panel > .panel-title p = 10px (10px)
SIZE src/styles.css:4172 .documents-panel > .panel-title .badge = 8px (8px)
SIZE src/styles.css:4175 .documents-panel > .fine-print = 8px (8px)
SIZE src/styles.css:4183 .page-tabs > button = 10px (10px)
SIZE src/styles.css:4195 .financing-intro p = 11px (11px)
SIZE src/styles.css:4205 .float-label = 8px (8px)
SIZE src/styles.css:4231 .financing-benefits p = 11px (11px)
SIZE src/styles.css:4242 .wizard-progress > span = 8px (8px)
SIZE src/styles.css:4249 .wizard-progress b = 8px (8px)
SIZE src/styles.css:4256 .selection-wizard p = 11px (11px)
SIZE src/styles.css:4268 .purpose b = 11px (11px)
SIZE src/styles.css:4271 .purpose small = 9px (9px)
SIZE src/styles.css:4279 .field = 11px (11px)
SIZE src/styles.css:4283 .field small = 10px (10px)
SIZE src/styles.css:4286 .wizard-actions .button = 10px (10px)
SIZE src/styles.css:4291 .alert = 11px (11px)
SIZE src/styles.css:4306 .result-head p = 10px (10px)
SIZE src/styles.css:4309 .result-head .badge = 8px (8px)
SIZE src/styles.css:4331 .calc-stats small = 9px (9px)
SIZE src/styles.css:4342 .result-analysis p = 10px (10px)
SIZE src/styles.css:4348 .result-risks p = 10px (10px)
SIZE src/styles.css:4355 .result-actions .button = 11px (11px)
SIZE src/styles.css:4358 .result-toolbar > .badge = 8px (8px)
SIZE src/styles.css:4361 .result-toolbar > .text-button = 10px (10px)
SIZE src/styles.css:4368 .selection-row b = 11px (11px)
SIZE src/styles.css:4371 .selection-row small = 8px (8px)
SIZE src/styles.css:4374 .selection-row > .badge = 8px (8px)
SIZE src/styles.css:4385 .history-panel > .panel-title .button = 10px (10px)
SIZE src/styles.css:4393 .my-credit .badge = 7px (7px)
SIZE src/styles.css:4397 .my-credit > .muted = 9px (9px)
SIZE src/styles.css:4403 .credit-amount small = 9px (9px)
SIZE src/styles.css:4409 .credit-params small = 8px (8px)
SIZE src/styles.css:4412 .credit-params b = 10px (10px)
SIZE src/styles.css:4418 .payment-value .badge = 9px (9px)
SIZE src/styles.css:4421 .payment-legend = 9px (9px)
SIZE src/styles.css:4424 .payment-legend b = 11px (11px)
SIZE src/styles.css:4430 .forecast-card .fine-print = 9px (9px)
SIZE src/styles.css:4436 .agent-insight p = 10px (10px)
SIZE src/styles.css:4442 .workspace-footer = 8px (8px)
SIZE src/styles.css:4471 .expanded .message-body = 11px (11px)
SIZE src/styles.css:4486 .expanded .composer-row textarea = 11px (11px)
SIZE src/styles.css:4489 .expanded .composer > small = 8px (8px)
SIZE src/styles.css:4516 .modal-actions .button = 10px (10px)
SIZE src/styles.css:4528 .extracted-fields span = 9px (9px)
SIZE src/styles.css:4531 .extracted-fields b = 11px (11px)
SIZE src/styles.css:4546 .toast = 11px (11px)
SIZE src/styles.css:4553 .formula = 9px (9px)
SIZE src/styles.css:4565 .workspace-footer > .text-button = 10px (10px)
SIZE src/redesign.css:124 .app-shell .workspace-footer = 10px (10px)
SIZE src/redesign.css:129 .app-shell .workspace-footer .text-button = 11px (11px)
SIZE src/redesign.css:284 .efficiency-grid span = 11px (11px)
SIZE src/redesign.css:388 .credit-dashboard .badge = 10px (10px)
SIZE src/redesign.css:444 .credit-dashboard .credit-params = 11px (11px)
SIZE src/redesign.css:486 .schedule-empty small = 11px (11px)
SIZE src/redesign.css:597 .chat-header-title small = 10px (10px)
SIZE src/redesign.css:633 .chat-history small = 10px (10px)
SIZE src/redesign.css:722 .message-body > time = 10px (10px)
SIZE src/redesign.css:725 .message-body > .badge = 9px (9px)
SIZE src/redesign.css:822 .composer > small = 10px (10px)
SIZE src/redesign.css:1021 .auth-form .fine-print = 11px (11px)
SIZE src/redesign.css:1089 .draft-status = 11px (11px)
SIZE src/redesign.css:1164 .range-labels = 11px (11px)
SIZE src/redesign.css:1167 .range-field > small = 11px (11px)
SIZE src/redesign.css:1185 .recommendation-heading .eyebrow = 11px (11px)
SIZE src/redesign.css:1246 .comparison-caption = 11px (11px)
SIZE src/redesign.css:1392 .demo-company span = 11px (11px)
SIZE src/redesign.css:1445 .hero-scenarios button = 10px (10px)
SIZE src/redesign.css:1581 .app-header .company-button span = 11px (11px)
SIZE src/redesign.css:1634 .app-header .brand small = 5px (5px)
SIZE src/redesign.css:1685 .work-toolbar .segmented button = 11px (11px)
SIZE src/redesign.css:1717 .credit-summary-grid small = 11px (11px)
SIZE src/redesign.css:1726 .credit-dashboard .payment-legend = 11px (11px)
SIZE src/redesign.css:1731 .credit-dashboard .badge = 9px (9px)
SIZE src/redesign.css:1735 .app-shell .workspace-footer = 9px (9px)
SIZE src/redesign.css:1742 .app-shell .workspace-footer .text-button = 10px (10px)
SIZE src/redesign.css:1760 .chat-header-title small = 9px (9px)
SIZE src/redesign.css:1767 .back-to-cabinet = 11px (11px)
SIZE src/redesign.css:1819 .composer > small = 9px (9px)
SIZE src/redesign.css:1822 .composer .finance-chat-cta = 11px (11px)
SIZE src/redesign.css:1856 .wizard-progress > span = 10px (10px)
SIZE src/redesign.css:1864 .draft-status = 10px (10px)
SIZE src/redesign.css:1908 .result-key-metrics small = 11px (11px)
SIZE src/redesign.css:1948 .onboarding .public-header .text-button = 11px (11px)
SIZE src/redesign.css:1983 .auth-form .fine-print = 10px (10px)
SIZE src/redesign.css:2004 .public-demo .public-header > .badge = 9px (9px)
SIZE src/redesign.css:2008 .public-demo .public-header > .button = 11px (11px)
SIZE src/redesign.css:2039 .public-demo .page-tabs button = 11px (11px)
SIZE src/redesign.css:2046 .hero-scenarios button = 9px (9px)
SIZE src/redesign.css:2049 .landing .public-header nav .text-button = 11px (11px)
SIZE src/motion.css:139 .finance-live-label = 10px (10px)
SIZE src/motion.css:168 .finance-scene-heading = 11px (11px)
SIZE src/motion.css:188 .finance-scene-card > p = 10px (10px)
SIZE src/motion.css:210 .finance-scene-foot = 9px (9px)
SIZE src/motion.css:237 .finance-insight b = 11px (11px)
SIZE src/motion.css:242 .finance-insight small = 9px (9px)
SIZE src/motion.css:270 .finance-controls button = 10px (10px)
SIZE src/motion.css:275 .finance-controls button > span = 8px (8px)
SIZE src/motion.css:303 .finance-example-note = 9px (9px)
SIZE src/motion.css:564 .preparation-screen .preparation-header-note = 9px (9px)
SIZE src/motion.css:704 .preparation-copy .eyebrow = 9px (9px)
SIZE src/motion.css:777 .preparation-screen > footer = 10px (10px)
SIZE src/motion.css:834 .finance-insight b = 10px (10px)
SIZE src/motion.css:838 .finance-live-label = 9px (9px)
SIZE src/motion.css:849 .finance-example-note = 8px (8px)
SIZE src/chat.css:60 .chat-funding-context = 11px (11px)
SIZE src/chat.css:63 .chat-funding-context .text-button = 11px (11px)
SIZE src/chat.css:239 .chat-shell.chat-v3 .history-caption = 10px (10px)
SIZE src/chat.css:289 .chat-shell.chat-v3 .history-select > small = 9px (9px)
SIZE src/chat.css:410 .chat-shell.chat-v3 .starter-prompts > button, .chat-shell.chat-v3 .context-prompts > button = 11px (11px)
SIZE src/chat.css:433 .chat-shell.chat-v3 .context-prompts > button = 10px (10px)
SIZE src/chat.css:494 .chat-shell.chat-v3 .message-body > time = 9px (9px)
SIZE src/chat.css:505 .chat-shell.chat-v3 .message-body > .badge = 9px (9px)
SIZE src/chat.css:563 .chat-shell.chat-v3 .calculation .calc-stats small = 10px (10px)
SIZE src/chat.css:571 .chat-shell.chat-v3 .calculation .fine-print = 11px (11px)
SIZE src/chat.css:575 .chat-shell.chat-v3 .calculation .info-grid small = 10px (10px)
SIZE src/chat.css:591 .chat-shell.chat-v3 .calculation table, .chat-shell.chat-v3 .markdown-text table = 11px (11px)
SIZE src/chat.css:631 .chat-shell.chat-v3 .proposal .button = 11px (11px)
SIZE src/chat.css:772 .chat-shell.chat-v3 .composer .finance-chat-cta = 10px (10px)
SIZE src/chat.css:779 .chat-shell.chat-v3 .composer-bottom > small = 9px (9px)
SIZE src/chat.css:817 .chat-shell.chat-v3 .composer-file b = 10px (10px)
SIZE src/chat.css:825 .chat-shell.chat-v3 .composer-file small = 8px (8px)
SIZE src/chat.css:863 .chat-shell.chat-v3 .starter-prompts > button = 10px (10px)
SIZE src/chat.css:938 .chat-shell .message-feedback-row time = 10px (10px)
SIZE src/cabinet.css:46 .cv-editor .cv-field-hint = 11px (11px)
SIZE src/cabinet.css:97 .cv-heading small = 9px (9px)
SIZE src/cabinet.css:108 .cv-heading > span = 11px (11px)
SIZE src/cabinet.css:136 .cv-card-head p = 11px (11px)
SIZE src/cabinet.css:151 .cv-chip = 9px (9px)
SIZE src/cabinet.css:162 .cv-card small = 11px (11px)
SIZE src/cabinet.css:183 .cv-loan-facts span, .cv-payment-parts span = 10px (10px)
SIZE src/cabinet.css:216 .cv-progress small = 10px (10px)
SIZE src/cabinet.css:222 .cv-terms = 10px (10px)
SIZE src/cabinet.css:231 .cv-card summary = 11px (11px)
SIZE src/cabinet.css:238 .cv-card details p = 11px (11px)
SIZE src/cabinet.css:256 .cabinet-v2 .button = 11px (11px)
SIZE src/cabinet.css:261 .cabinet-v2 .text-button = 10px (10px)
SIZE src/cabinet.css:294 .cv-calendar-button = 11px (11px)
SIZE src/cabinet.css:312 .cv-chart-key = 10px (10px)
SIZE src/cabinet.css:330 .cv-chart-key small = 9px (9px)
SIZE src/cabinet.css:379 .touring .cv-financial .cv-metric > span = 8px (8px)
SIZE src/cabinet.css:389 .cv-axis-top, .cv-axis-zero = 8px (8px)
SIZE src/cabinet.css:402 .cv-xlabels = 9px (9px)
SIZE src/cabinet.css:418 .cv-chart-tooltip b = 11px (11px)
SIZE src/cabinet.css:423 .cv-chart-tooltip small = 9px (9px)
SIZE src/cabinet.css:445 .cv-chart-empty p = 11px (11px)
SIZE src/cabinet.css:480 .cv-cash > span, .cv-forecast > span = 10px (10px)
SIZE src/cabinet.css:486 .cv-card dl, .cv-calendar dl = 11px (11px)
SIZE src/cabinet.css:510 .cv-forecast > p = 11px (11px)
SIZE src/cabinet.css:528 .cv-forecast-more span = 9px (9px)
SIZE src/cabinet.css:533 .cv-forecast-more b = 11px (11px)
SIZE src/cabinet.css:556 .cv-discuss = 10px (10px)
SIZE src/cabinet.css:577 .cv-metric small = 10px (10px)
SIZE src/cabinet.css:594 .cv-metric > span = 9px (9px)
SIZE src/cabinet.css:619 .cv-recommendations .cv-card-head small = 9px (9px)
SIZE src/cabinet.css:648 .cv-recommendations article p = 11px (11px)
SIZE src/cabinet.css:654 .cv-recommendations time = 9px (9px)
SIZE src/cabinet.css:667 .cv-no-signals p = 11px (11px)
SIZE src/cabinet.css:671 .cv-training-label = 10px (10px)
SIZE src/cabinet.css:679 .cv-note = 11px (11px)
SIZE src/cabinet.css:731 .cv-confirm span = 11px (11px)
SIZE src/cabinet.css:777 .cv-calendar-grid small = 10px (10px)
SIZE src/cabinet.css:816 .cv-calendar-detail > small = 11px (11px)
SIZE src/cabinet.css:825 .cv-calendar-detail p = 11px (11px)
SIZE src/cabinet.css:843 .cv-metric-info dt = 10px (10px)
SIZE src/cabinet.css:863 .nc-count = 8px (8px)
SIZE src/cabinet.css:903 .nc-panel header small = 10px (10px)
SIZE src/cabinet.css:914 .nc-toolbar small = 9px (9px)
SIZE src/cabinet.css:920 .nc-toolbar button = 10px (10px)
SIZE src/cabinet.css:964 .nc-list p = 11px (11px)
SIZE src/cabinet.css:971 .nc-list time = 9px (9px)
SIZE src/cabinet.css:986 .nc-actions button = 10px (10px)
SIZE src/cabinet.css:999 .nc-empty p = 11px (11px)
SIZE src/cabinet.css:1091 .cv-xlabels = 8px (8px)
SIZE src/cabinet.css:1094 .cv-metric > span = 10px (10px)
SIZE src/cabinet.css:1367 .calendar-discuss = 11px (11px)
SIZE src/cabinet.css:1545 .date-input-weekday = 11px (11px)
SIZE src/cabinet.css:1575 .date-input-popup > footer = 10px (10px)
SIZE src/cabinet.css:1644 .unified-cabinet .cv-axis-top, .unified-cabinet .cv-axis-zero = 9px (9px)
SIZE src/cabinet.css:1663 .unified-cabinet .cv-xlabels = 10px (10px)
SIZE src/cabinet.css:1701 .unified-indicators .cv-card-head small = 11px (11px)
SIZE src/cabinet.css:1726 .unified-indicators .cv-metric > span = 11px (11px)
SIZE src/cabinet.css:1770 .unified-cabinet .metric-scale-labels small = 10px (10px)
SIZE src/cabinet.css:1847 .context-help-panel dt = 10px (10px)
SIZE src/cabinet.css:1859 .context-help-hint = 10px (10px)
SIZE src/cabinet.css:1923 .anchored-calendar .cv-calendar-detail p = 11px (11px)
SIZE src/cabinet.css:1926 .anchored-calendar .cv-note = 10px (10px)
SIZE src/cabinet.css:2004 .touring .cv-financial .cv-forecast > span, .touring .cv-financial .cv-cash > small, .touring .cv-financial .cv-forecast > small = 10px (10px)
SIZE src/cabinet.css:2022 .touring .cv-financial .cv-metric small = 9px (9px)
SIZE src/cabinet.css:2035 .touring .cv-financial .metric-scale-labels small = 8px (8px)
SIZE src/financing.css:74 .funding-step-label small = 11px (11px)
SIZE src/financing.css:112 .funding-stages b = 11px (11px)
SIZE src/financing.css:175 .funding-purpose-grid small = 11px (11px)
SIZE src/financing.css:258 .funding-mvp .range-field small = 10px (10px)
SIZE src/financing.css:279 .funding-section-title small = 11px (11px)
SIZE src/financing.css:301 .funding-profile small = 11px (11px)
SIZE src/financing.css:322 .funding-data-field > .badge = 9px (9px)
SIZE src/financing.css:326 .funding-data-field > small = 10px (10px)
SIZE src/financing.css:346 .funding-net-flow small = 10px (10px)
SIZE src/financing.css:368 .funding-upload p = 11px (11px)
SIZE src/financing.css:376 .funding-source = 11px (11px)
SIZE src/financing.css:408 .funding-history-row small = 11px (11px)
SIZE src/financing.css:419 .funding-result-toolbar = 11px (11px)
SIZE src/financing.css:464 .funding-capacity-unknown = 10px (10px)
SIZE src/financing.css:469 .funding-scale-hint = 10px (10px)
SIZE src/financing.css:483 .funding-result-metrics small = 11px (11px)
SIZE src/financing.css:518 .funding-verdict p = 11px (11px)
SIZE src/financing.css:571 .funding-checks .badge = 9px (9px)
SIZE src/financing.css:581 .funding-assessment table = 11px (11px)
SIZE src/financing.css:586 .funding-assessment td small = 10px (10px)
SIZE src/financing.css:596 .funding-formulas p = 11px (11px)
SIZE src/financing.css:603 .funding-detail-values = 11px (11px)
SIZE src/financing.css:643 .funding-alternatives span = 11px (11px)
SIZE src/financing.css:662 .funding-catalog-warning = 11px (11px)
SIZE src/financing.css:688 .funding-versions > button = 11px (11px)
SIZE src/financing.css:716 .funding-application dt = 11px (11px)
SIZE src/financing.css:781 .funding-purpose-grid small = 11px (11px)
SIZE src/financing.css:785 .funding-stages = 10px (10px)
SIZE src/financing.css:808 .funding-form-actions .button = 11px (11px)
SIZE src/financing.css:847 .funding-result-head .eyebrow = 9px (9px)
SIZE src/financing.css:850 .funding-result-head .badge = 9px (9px)
CONTRAST src/styles.css:8 :root #171923 / #f6f7f9 = 16.329:1 PASS
CONTRAST src/styles.css:102 input, select, textarea #171923 / #fff = 17.504:1 PASS
CONTRAST src/styles.css:144 .button #fff / #ef3124 = 4.090:1 FAIL
CONTRAST src/styles.css:158 .button.secondary #242835 / #fff = 14.686:1 PASS
CONTRAST src/styles.css:254 .badge #717989 / #f1f3f6 = 3.937:1 FAIL
CONTRAST src/styles.css:261 .badge.red #d9352a / #fff0ef = 4.220:1 FAIL
CONTRAST src/styles.css:265 .badge.green #148760 / #eaf7f0 = 4.087:1 FAIL
CONTRAST src/styles.css:284 .icon-tile #687184 / #f3f5f8 = 4.488:1 FAIL
CONTRAST src/styles.css:289 .icon-tile.red #ef3124 / #fff0ee = 3.691:1 FAIL
CONTRAST src/styles.css:293 .icon-tile.green #12865f / #e8f5ef = 4.073:1 FAIL
CONTRAST src/styles.css:372 .alert #966533 / #fff6ed = 4.674:1 PASS
CONTRAST src/styles.css:380 .alert.error #c8352a / #fff0ef = 4.742:1 PASS
CONTRAST src/styles.css:859 .step-number #ef3124 / #fff = 4.090:1 FAIL
CONTRAST src/styles.css:1072 .answer-icon #8b92a1 / #f4f5f8 = 2.865:1 FAIL
CONTRAST src/styles.css:1081 .answer.selected .answer-icon #ef3124 / #ffe9e5 = 3.513:1 FAIL
CONTRAST src/styles.css:1272 .demo-ribbon #9a7b76 / #fff8f5 = 3.657:1 FAIL
CONTRAST src/styles.css:1508 .empty-wallet #ef3124 / #fff = 4.090:1 FAIL
CONTRAST src/styles.css:1515 .empty-check #fff / #148d67 = 4.170:1 FAIL
CONTRAST src/styles.css:1744 .segmented > button.active #3a4356 / #fff = 9.919:1 PASS
CONTRAST src/styles.css:1818 .agent-avatar #fff / #ef3124 = 4.090:1 FAIL
CONTRAST src/styles.css:1926 .starter-prompts > button #828b9b / #fff = 3.434:1 FAIL
CONTRAST src/styles.css:1949 .message-agent #ef3124 / #fff0ed = 3.688:1 FAIL
CONTRAST src/styles.css:2045 .finance-chat-cta #cc5b4e / #fff7f4 = 3.839:1 FAIL
CONTRAST src/styles.css:2084 .send-button #fff / #ef3124 = 4.090:1 FAIL
CONTRAST src/styles.css:2270 .profile-table dt #9aa2b1 / #fafbfd = 2.480:1 FAIL
CONTRAST src/styles.css:2327 .doc-icon #20a56e / #eaf6ee = 2.836:1 FAIL
CONTRAST src/styles.css:2332 .color-1, .color-2 #377fe8 / #edf3ff = 3.517:1 FAIL
CONTRAST src/styles.css:2336 .color-3 #e9992d / #fff5e8 = 2.150:1 FAIL
CONTRAST src/styles.css:2340 .color-4 #956bea / #f1ecff = 3.265:1 FAIL
CONTRAST src/styles.css:2344 .color-5 #d65b8c / #fff0f4 = 3.317:1 FAIL
CONTRAST src/styles.css:2381 .file-name #959fb2 / #fafbfd = 2.574:1 FAIL
CONTRAST src/styles.css:2546 .circle-inner #ef3124 / #fff = 4.090:1 FAIL
CONTRAST src/styles.css:2564 .float-label #8f817c / #fff = 3.751:1 FAIL
CONTRAST src/styles.css:2644 .wizard-progress > span.active b #ef3124 / #fff1eb = 3.707:1 FAIL
CONTRAST src/styles.css:2785 .result-symbol #149268 / #edf7f1 = 3.590:1 FAIL
CONTRAST src/styles.css:2833 .formula #63748a / #f7f9fc = 4.530:1 PASS
CONTRAST src/styles.css:2874 th #95a0b2 / #f5f7fa = 2.462:1 FAIL
CONTRAST src/styles.css:2991 .success-state #31946b / #eff8f3 = 3.476:1 FAIL
CONTRAST src/styles.css:3128 .toast #fff / #263144 = 13.082:1 PASS
CONTRAST src/styles.css:3179 .tour-icon #ef3124 / #fff1ec = 3.709:1 FAIL
CONTRAST src/redesign.css:125 .app-shell .workspace-footer #687385 / #fff = 4.795:1 PASS
CONTRAST src/redesign.css:475 .schedule-empty #687385 / #fafbfc = 4.628:1 PASS
CONTRAST src/redesign.css:528 .forecast-conclusion #25614d / #f1f7f4 = 6.683:1 PASS
CONTRAST src/redesign.css:532 .forecast-conclusion.warning #90602a / #fff5e9 = 5.007:1 PASS
CONTRAST src/redesign.css:1282 .result-verdict #805422 / #fff7eb = 6.156:1 PASS
CONTRAST src/redesign.css:1286 .positive .result-verdict #1a614a / #edf7f2 = 6.726:1 PASS
CONTRAST src/redesign.css:1290 .unknown .result-verdict #4b5b70 / #f1f4f8 = 6.283:1 PASS
CONTRAST src/motion.css:279 .finance-controls button.active #d93126 / #fff3ef = 4.373:1 FAIL
CONTRAST src/motion.css:432 .journey-check #12865f / #e8f5ee = 4.070:1 FAIL
CONTRAST src/motion.css:744 .preparation-stages > span #ef3124 / #e3e6eb = 3.269:1 FAIL
CONTRAST src/chat.css:59 .chat-funding-context #8a97a9 / #fafbfd = 2.865:1 FAIL
CONTRAST src/chat.css:94 .chat-shell.chat-v3 .icon-button:hover #272e3a / #eef0f4 = 11.966:1 PASS
CONTRAST src/chat.css:211 .chat-shell.chat-v3 .history-search-row #89909d / #fff = 3.211:1 FAIL
CONTRAST src/chat.css:370 .chat-shell.chat-v3 .welcome-orb #ef3124 / #fff4f1 = 3.790:1 FAIL
CONTRAST src/chat.css:409 .chat-shell.chat-v3 .starter-prompts > button, .chat-shell.chat-v3 .context-prompts > button #737c8b / #fff = 4.213:1 FAIL
CONTRAST src/chat.css:452 .chat-shell.chat-v3 .message-agent #ed5d4f / #fff4f0 = 3.097:1 FAIL
CONTRAST src/chat.css:483 .chat-shell.chat-v3 .message.user .message-body #434b59 / #f2f3f6 = 7.921:1 PASS
CONTRAST src/chat.css:503 .chat-shell.chat-v3 .message-body > .badge #979eab / #f4f5f7 = 2.470:1 FAIL
CONTRAST src/chat.css:612 .chat-shell.chat-v3 .chat-finance-warning, .chat-shell.chat-v3 .proposal #8b7659 / #fffbf5 = 4.214:1 FAIL
CONTRAST src/chat.css:628 .chat-shell.chat-v3 .proposal #627084 / #f8fafc = 4.813:1 PASS
CONTRAST src/chat.css:735 .chat-shell.chat-v3 .composer .send-button #fff / #ef3124 = 4.090:1 FAIL
CONTRAST src/chat.css:748 .chat-shell.chat-v3 .send-button:disabled #a7aeb9 / #e6e9ef = 1.837:1 FAIL
CONTRAST src/chat.css:802 .chat-shell.chat-v3 .composer-file #8d97a7 / #fafbfc = 2.848:1 FAIL
CONTRAST src/chat.css:943 .chat-shell .feedback-icon:hover:not(:disabled) #4b5260 / #f1f3f6 = 7.062:1 PASS
CONTRAST src/chat.css:944 .chat-shell .feedback-icon[aria-pressed="true"] #0b0b0c / #eef0f3 = 17.232:1 PASS
CONTRAST src/chat.css:957 .chat-shell .feedback-reason:has(input:checked) #0b0b0c / #f6f7f9 = 18.354:1 PASS
CONTRAST src/cabinet.css:150 .cv-chip #8b94a2 / #f5f6f8 = 2.833:1 FAIL
CONTRAST src/cabinet.css:434 .cv-chart-empty #a4adba / #fafbfd = 2.189:1 FAIL
CONTRAST src/cabinet.css:557 .cv-discuss #6d7a8d / #f8fafc = 4.165:1 FAIL
CONTRAST src/cabinet.css:672 .cv-training-label #a78672 / #faf5f0 = 3.079:1 FAIL
CONTRAST src/cabinet.css:768 .cv-calendar-head button #7e8da2 / #f6f8fb = 3.174:1 FAIL
CONTRAST src/cabinet.css:788 .cv-calendar-grid button #8590a1 / #fafbfd = 3.120:1 FAIL
CONTRAST src/cabinet.css:792 .cv-calendar-grid button.has-payment #c57f70 / #fff3ee = 2.906:1 FAIL
CONTRAST src/cabinet.css:797 .cv-calendar-grid button.selected #586a82 / #edf0f5 = 4.839:1 PASS
CONTRAST src/cabinet.css:870 .nc-count white / #e27266 = 3.074:1 FAIL
CONTRAST src/cabinet.css:889 .nc-panel #5a687c / white = 5.667:1 PASS
CONTRAST src/cabinet.css:947 .nc-icon #a3afc0 / #f0f3f7 = 1.997:1 FAIL
CONTRAST src/cabinet.css:951 .nc-icon.risk #c0a07c / #faf3eb = 2.229:1 FAIL
CONTRAST src/cabinet.css:1241 .cv-calendar-launch #576b88 / #f5f7fb = 5.067:1 PASS
CONTRAST src/cabinet.css:1253 .cv-calendar-launch:hover:not(:disabled), .cv-calendar-launch[aria-expanded="true"] #ed392d / #fff0ee = 3.628:1 FAIL
CONTRAST src/cabinet.css:1302 .anchored-calendar .cv-calendar-head > button #506581 / #fff = 5.967:1 PASS
CONTRAST src/cabinet.css:1306 .anchored-calendar .cv-calendar-head > button:hover:not(:disabled) #e63a2e / #fff0ee = 3.783:1 FAIL
CONTRAST src/cabinet.css:1324 .anchored-calendar .cv-calendar-grid > button #485b75 / #fff = 6.933:1 PASS
CONTRAST src/cabinet.css:1332 .anchored-calendar .cv-calendar-grid > button.has-payment #c83226 / #fff0ed = 4.807:1 PASS
CONTRAST src/cabinet.css:1338 .anchored-calendar .cv-calendar-grid > button.selected #fff / #f03529 = 4.003:1 FAIL
CONTRAST src/cabinet.css:1363 .calendar-discuss #435674 / #fff = 7.442:1 PASS
CONTRAST src/cabinet.css:1390 .anchored-calendar .calendar-picker-trigger, .date-input-popup .calendar-picker-trigger #364b69 / #f7f9fc = 8.411:1 PASS
CONTRAST src/cabinet.css:1425 .calendar-picker-menu button #3b506d / #fff = 8.222:1 PASS
CONTRAST src/cabinet.css:1430 .calendar-picker-menu button[aria-selected="true"] #d1392c / #fff0ed = 4.371:1 FAIL
CONTRAST src/cabinet.css:1465 .date-input-trigger:hover, .date-input-trigger[aria-expanded="true"] #df362b / #fff0ed = 4.029:1 FAIL
CONTRAST src/cabinet.css:1479 .date-input-popup #23334d / #fff = 12.711:1 PASS
CONTRAST src/cabinet.css:1505 .date-input-popup > header button, .date-input-navigation > button #627895 / #fff = 4.526:1 PASS
CONTRAST src/cabinet.css:1510 .date-input-popup button:hover:not(:disabled) #d5362a / #fff0ed = 4.314:1 FAIL
CONTRAST src/cabinet.css:1552 .date-input-grid > button #465b77 / #f7f9fc = 6.586:1 PASS
CONTRAST src/cabinet.css:1564 .date-input-grid > button[aria-pressed="true"] white / #f03529 = 4.003:1 FAIL
CONTRAST src/cabinet.css:1807 .context-help-trigger:hover, .context-help-trigger[aria-expanded="true"] #e6342a / #f0f3f8 = 3.862:1 FAIL
CONTRAST src/cabinet.css:1830 .context-help-panel, .anchored-calendar #243047 / #fff = 13.218:1 PASS
CONTRAST src/cabinet.css:1892 .anchored-calendar > header button #63718a / #f3f5f8 = 4.514:1 PASS
CONTRAST src/cabinet.css:1903 .cv-month-selectors select #37445a / #f5f7fa = 9.157:1 PASS
CONTRAST src/financing.css:120 .funding-stages .active b #ed3a2c / #fff0ed = 3.613:1 FAIL
CONTRAST src/financing.css:159 .funding-purpose-icon #f1392e / #fff0ed = 3.530:1 FAIL
CONTRAST src/financing.css:226 .funding-choices button #5c6e88 / #f8f9fc = 4.936:1 PASS
CONTRAST src/financing.css:229 .funding-choices button[aria-pressed="true"] #d93227 / #fff0ed = 4.269:1 FAIL
CONTRAST src/financing.css:336 .funding-net-flow #657792 / #f7f9fc = 4.322:1 FAIL
CONTRAST src/financing.css:382 .funding-error #b83428 / #fff2ef = 5.393:1 PASS
CONTRAST src/financing.css:499 .funding-verdict #677b96 / #f8f9fc = 4.113:1 FAIL
CONTRAST src/financing.css:503 .positive .funding-verdict #3d8663 / #f1f9f5 = 4.095:1 FAIL
CONTRAST src/financing.css:507 .caution .funding-verdict #b48048 / #fff6ef = 3.215:1 FAIL
CONTRAST src/financing.css:663 .funding-catalog-warning #bc6d40 / #fff9f2 = 3.720:1 FAIL
CONTRAST src/financing.css:698 .funding-old-version #96723c / #fff6e8 = 4.110:1 FAIL
CONTRAST src/financing.css:729 .funding-success #3a8060 / #f1f9f5 = 4.420:1 FAIL
CONTRAST src/manager/manager.css:194 .manager-tabs .button[aria-pressed="true"] #fff / #171923 = 17.504:1 PASS
UNRESOLVED src/styles.css:174 .text-button: contrast needs backdrop/computed style: inherit / none
UNRESOLVED src/styles.css:198 .icon-button: contrast needs backdrop/computed style: #555e70 / transparent
UNRESOLVED src/styles.css:1187 .demo-switch > button: contrast needs backdrop/computed style: #88685d / #ffffff90
UNRESOLVED src/styles.css:1230 .app-header nav button: contrast needs backdrop/computed style: #858b98 / none
UNRESOLVED src/styles.css:1738 .segmented > button: contrast needs backdrop/computed style: #929aaa / none
UNRESOLVED src/styles.css:1887 .welcome-orb: contrast needs backdrop/computed style: #ef3124 / radial-gradient(circle at 30% 25%, #ffebe7, #fff8f5)
UNRESOLVED src/styles.css:2417 .fixture-link: contrast needs backdrop/computed style: #9aa4b4 / none
UNRESOLVED src/styles.css:2472 .page-tabs > button: contrast needs backdrop/computed style: #959eae / none
UNRESOLVED src/styles.css:3140 .toast > button: contrast needs backdrop/computed style: #fff / none
UNRESOLVED src/redesign.css:753 .markdown-text code: font-size requires computed style
UNRESOLVED src/redesign.css:789 .composer .finance-chat-cta: contrast needs backdrop/computed style: #525e70 / transparent
UNRESOLVED src/redesign.css:1049 .password-input > button: contrast needs backdrop/computed style: #687385 / transparent
UNRESOLVED src/motion.css:56 .orbit-satellite: contrast needs backdrop/computed style: #a08b82 / #ffffffd9
UNRESOLVED src/motion.css:80 .finance-core: contrast needs backdrop/computed style: #fff / linear-gradient(145deg, #ff9781 -15%, #ff4435 35%, #e4201b 80%)
UNRESOLVED src/motion.css:271 .finance-controls button: contrast needs backdrop/computed style: #8d929f / transparent
UNRESOLVED src/motion.css:407 .journey-illustration: contrast needs backdrop/computed style: #ef3124 / radial-gradient(ellipse at 30% 50%, #ffe7df, transparent 70%)
UNRESOLVED src/motion.css:717 .preparation-copy h1: contrast needs backdrop/computed style: #292630 / linear-gradient(105deg, #292630 15%, #d85842 42%, #292630 67%)
UNRESOLVED src/chat.css:87 .chat-shell.chat-v3 .icon-button: contrast needs backdrop/computed style: #828997 / transparent
UNRESOLVED src/chat.css:194 .chat-shell.chat-v3 .history-new: contrast needs backdrop/computed style: #535c6b / transparent
UNRESOLVED src/chat.css:276 .chat-shell.chat-v3 .history-select: contrast needs backdrop/computed style: #596272 / transparent
UNRESOLVED src/chat.css:465 .chat-shell.chat-v3 .message-body: contrast needs backdrop/computed style: #3e4756 / transparent
UNRESOLVED src/chat.css:643 .chat-shell.chat-v3 .thinking: contrast needs backdrop/computed style: #9da4b0 / transparent
UNRESOLVED src/chat.css:715 .chat-shell.chat-v3 .composer-row textarea: contrast needs backdrop/computed style: #3d485b / transparent
UNRESOLVED src/chat.css:771 .chat-shell.chat-v3 .composer .finance-chat-cta: contrast needs backdrop/computed style: #8b95a5 / transparent
UNRESOLVED src/chat.css:812 .chat-shell.chat-v3 .composer-file > button:not(.icon-button), .chat-shell.chat-v3 .composer-file > span: contrast needs backdrop/computed style: #687486 / transparent
UNRESOLVED src/chat.css:941 .chat-shell .feedback-icon: contrast needs backdrop/computed style: #9aa1ad / transparent
UNRESOLVED src/cabinet.css:295 .cv-calendar-button: contrast needs backdrop/computed style: #78869a / none
UNRESOLVED src/cabinet.css:456 .cv-icon: contrast needs backdrop/computed style: #9da6b3 / none
UNRESOLVED src/cabinet.css:582 .cv-metric button: contrast needs backdrop/computed style: #acb3bd / none
UNRESOLVED src/cabinet.css:748 .cv-plan-row button: contrast needs backdrop/computed style: #a5aebc / none
UNRESOLVED src/cabinet.css:923 .nc-toolbar button: contrast needs backdrop/computed style: #8495ab / none
UNRESOLVED src/cabinet.css:987 .nc-actions button: contrast needs backdrop/computed style: #8595aa / none
UNRESOLVED src/cabinet.css:1459 .date-input-trigger: contrast needs backdrop/computed style: #61728b / transparent
UNRESOLVED src/cabinet.css:1582 .date-input-popup > footer button: contrast needs backdrop/computed style: #d5362a / transparent
UNRESOLVED src/cabinet.css:1801 .context-help-trigger, .cv-metric .context-help-trigger: contrast needs backdrop/computed style: #78869c / none
UNRESOLVED src/financing.css:687 .funding-versions > button: contrast needs backdrop/computed style: #75859b / transparent
LAYOUT src/styles.css:190 .icon-button: fixed height 35px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:224 .brand-symbol: fixed height 38px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:231 .brand-symbol > span: fixed height 3px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:282 .icon-tile: fixed height 43px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:298 .tiny-red: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:306 .pulse-dot, .status-dot: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:315 .offline-dot, .neutral-dot: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:392 .spinner: fixed height 24px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:410 .public-header: fixed height 86px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:501 .visual-orbit:before: fixed height 300px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:554 .chart-arrow: fixed height 38px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:589 .legend: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:758 .mini-bars: fixed height 120px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:787 .feature-big-icon: fixed height 42px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:798 .payment-ring: fixed height 80px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:860 .step-number: fixed height 38px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1010 .onboard-progress > div: fixed height 3px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1070 .answer-icon: fixed height 38px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1100 .radio: fixed height 16px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1120 .compact .answer-icon: fixed height 25px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1207 .app-header: fixed height 77px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1335 .intro-note .icon-tile: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1344 .splitter: fixed height 450px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1354 .splitter > span: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1364 .splitter > input: fixed height 120px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1407 .notification-dot: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1467 .notice .icon-tile: fixed height 30px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1483 .empty-illustration: fixed height 130px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1491 .empty-orbit: fixed height 115px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1500 .empty-wallet: fixed height 78px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1518 .empty-check: fixed height 27px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1570 .demo-load .icon-tile: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1627 .progress-track: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1693 .payment-breakdown: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1704 .payment-legend i: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1799 .chat-shell: fixed height 614px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1815 .agent-avatar: fixed height 33px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1850 .chat-header .icon-button: fixed height 29px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1881 .welcome-orb: fixed height 50px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1947 .message-agent: fixed height 25px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2010 .thinking i: fixed height 4px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2061 .composer-row > .icon-button: fixed height 30px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2080 .send-button: fixed height 33px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2301 .onboard-facts .icon-tile: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2323 .doc-icon: fixed height 39px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2519 .finance-circle: fixed height 210px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2541 .circle-inner: fixed height 95px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2634 .wizard-progress b: fixed height 25px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2682 .purpose .icon-tile: fixed height 38px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2778 .result-symbol: fixed height 78px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3175 .tour-icon: fixed height 55px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3199 .tour-dots i: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3325 .chat-header .icon-button: fixed height 26px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3329 .agent-avatar: fixed height 29px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3356 .public-header: fixed height 75px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3482 .chat-shell: fixed height 600px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3599 .public-header: fixed height 70px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3649 .visual-orbit:before: fixed height 240px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3680 .visual-chip .icon-tile: fixed height 30px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3712 .benefit-strip svg: fixed height 21px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3763 .mini-bars: fixed height 90px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3785 .step-number: fixed height 32px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3884 .app-header: fixed height 68px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3899 .app-header .brand-symbol: fixed height 31px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3906 .app-header .brand-symbol > span: fixed height 2px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3913 .header-tools .icon-button: fixed height 29px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3980 .empty-illustration: fixed height 115px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:4024 .chat-shell: fixed height 590px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:4039 .agent-avatar: fixed height 31px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:4044 .chat-header .icon-button: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:4248 .wizard-progress b: fixed height 21px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:4312 .result-symbol: fixed height 48px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:55 .visually-hidden: fixed height 1px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:215 .splitter > span: fixed height 52px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:418 .credit-summary .progress-track: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:587 .chat-header .icon-button: fixed height 32px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:665 .chat-welcome .welcome-orb: fixed height 40px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:729 .message-agent: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:817 .composer .send-button: fixed height 38px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:828 .composer-row .icon-button: fixed height 38px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:923 .onboard-progress > div: fixed height 4px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:996 .question-sector select: fixed height 50px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1043 .password-input > button: fixed height 40px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1130 .range-field input[type="range"]: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1145 .range-field input[type="range"]::-webkit-slider-thumb: fixed height 21px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1155 .range-field input[type="range"]::-moz-range-thumb: fixed height 16px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1227 .capacity-track: fixed height 8px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1764 .chat-header .icon-button: fixed height 32px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1801 .message-agent: fixed height 23px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1861 .wizard-progress b: fixed height 22px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:55 .orbit-satellite: fixed height 43px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:75 .finance-core: fixed height 112px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:102 .finance-core > i: fixed height 7px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:119 .finance-signal > span: fixed height 4px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:144 .motion-status-dot: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:196 .finance-sparkline: fixed height 115px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:248 .finance-insight .icon-tile: fixed height 36px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:402 .journey-illustration: fixed height 100px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:419 .journey-mini-line: fixed height 7px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:435 .journey-check: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:442 .journey-doc: fixed height 59px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:457 .journey-doc::after: fixed height 4px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:470 .journey-bar: fixed height 25px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:480 .journey-bar.second: fixed height 42px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:485 .journey-bar.third: fixed height 60px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:580 .preparation-orbit: fixed height 355px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:607 .preparation-orbit i::after: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:615 .preparation-sphere: fixed height 240px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:642 .sphere-liquid i: fixed height 45px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:668 .sphere-shine::before: fixed height 23px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:739 .preparation-stages > span: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:818 .finance-core: fixed height 92px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:869 .preparation-orbit: fixed height 295px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:874 .preparation-sphere: fixed height 205px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:70 .chat-shell.chat-v3 .chat-header: fixed height 58px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:81 .chat-shell.chat-v3 .icon-button: fixed height 32px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:220 .chat-shell.chat-v3 .history-search-row .chat-search: fixed height 30px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:232 .chat-shell.chat-v3 .history-search-row .icon-button: fixed height 23px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:295 .chat-shell.chat-v3 .history-rename: fixed height 25px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:365 .chat-shell.chat-v3 .welcome-orb: fixed height 45px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:446 .chat-shell.chat-v3 .message-agent: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:648 .chat-shell.chat-v3 .thinking > .chat-spinner: fixed height 13px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:695 .chat-shell.chat-v3 .composer-row > .icon-button: fixed height 36px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:705 .chat-shell.chat-v3 .composer-row textarea: fixed height 24px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:729 .chat-shell.chat-v3 .composer .send-button: fixed height 36px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:831 .chat-shell.chat-v3 .composer-file .icon-button: fixed height 20px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:873 .chat-shell.chat-v3 .message-agent: fixed height 24px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:940 .chat-shell .feedback-icon: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:203 .cv-progress > div: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:322 .cv-chart-key i: fixed height 2px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:334 .cv-chart-plot: fixed height 200px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:458 .cv-icon: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:631 .cv-recommendations article > i: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:803 .cv-calendar-grid button i: fixed height 3px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:865 .nc-count: fixed height 14px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:943 .nc-icon: fixed height 32px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1238 .cv-calendar-launch: fixed height 40px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1298 .anchored-calendar .cv-calendar-head > button: fixed height 36px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1316 .anchored-calendar .cv-calendar-grid > span: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1320 .anchored-calendar .cv-calendar-grid > button: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1347 .anchored-calendar .cv-calendar-grid > button i: fixed height 4px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1456 .date-input-trigger: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1501 .date-input-popup > header button, .date-input-navigation > button: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1541 .date-input-grid > span, .date-input-grid > button: fixed height 32px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1632 .unified-cabinet .cv-chart-plot: fixed height 155px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1736 .metric-scale-track: fixed height 7px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1756 .metric-scale-track i: fixed height 13px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1795 .context-help-trigger, .cv-metric .context-help-trigger: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1889 .anchored-calendar > header button: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1911 .anchored-calendar .cv-calendar-grid button: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/financing.css:78 .funding-progress: fixed height 4px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/financing.css:111 .funding-stages b: fixed height 24px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/financing.css:157 .funding-purpose-icon: fixed height 42px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/financing.css:185 .funding-choice-check: fixed height 16px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/financing.css:455 .funding-result .capacity-track: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/financing.css:792 .funding-stages b: fixed height 20px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/manager/manager.css:183 .manager-return input: fixed height 18px; inspect text/clipping at 390/768/1280 and 200%
SUMMARY sizes<12=393; contrast<4.5=73; violations=466; unresolved=36; fixed-height-risks=157
Static source audit only: cascading overrides, inherited backgrounds, gradients, zoom and spacing require browser review.
```

## Сделано

Работа не объявляется готовой: приёмка заблокирована контрастом G5 и старым ожиданием формата в тесте F3. Сделан разрешённый участок G4. Ветка sasha/night сохранена, коммиты и новые ветки не создавались. Цветовые декларации сверены с HEAD: все 918 деклараций цветов, фонов и цветовых токенов восьми CSS сохранены, сравнение без учёта переводов строк.

Пути ниже от hw/tolya/alfa-intellect/.

src/styles.css:1: вместо сотен разрозненных размеров введена общая шкала --text-xs/sm/base/lg/xl/2xl/3xl: 12, 13, 15, 18, 24, 32, 48 px при корневом размере 16 px. Токены заданы в rem, body получает 15 px и line-height 1.5. Основной текст и текстовые кнопки отнесены к base, вторичный текст к sm, микро-подписи и small к xs. Кабинет и менеджер используют одни токены. Нормализованы 823 декларации font-size, единственный inline fontSize в src/Chat.tsx теперь использует --text-sm. Мелкие заголовки подняты до --text-lg. Полный список актуальных строк и значений в приложении ниже.

src/styles.css: табличные цифры включены через body и table; ключевые суммы в калькуляции, лимитах, платеже и подборе получили перенос внутри доступной колонки и line-height 1.3. У дочерних колонок снята минимальная ширина по содержимому. Для длинной прозы задан предел 70ch, который не доказывает фактическую длину строки без браузера.

src/redesign.css: строки оболочки с заголовком и подвалом теперь растут по содержимому, вместо жёсткого трека. Шапка и подвал переносят элементы. Мобильное меню привязано к фактической нижней границе шапки. src/chat.css: трек и высота шапки чата также могут расти. У текстовых полей, счётчика уведомлений, ячеек календаря и некоторых остальных текстовых блоков height заменён на min-height с height:auto. Две фиксированные высоты строки textarea заменены на безразмерные значения. Декоративные размеры, иконки, SVG и полоски прогресса оставлены фиксированными, их список измеритель выводит как кандидатов на проверку.

src/application-status.css: денежные условия предложения выделены размером 24 px, колонки используют min(220px, 100%), суммы переносятся. src/manager/manager.css: суммы в очереди выделены размером 24 px с переносом и табличными цифрами. src/cabinet.css: сохранена иерархия крупных сумм, добавлен перенос платежа и прогноза по доступной ширине.

src/format-rate.ts:1: одна функция formatRate принимает процентные пункты, сохраняет до четырёх дробных знаков и возвращает 21,5 с неразрывным пробелом перед %. NaN/Infinity получают «Нет данных». Семь выводов ставки в шести компонентах используют её. Долевой offer.rate умножается на 100 ровно в месте вывода, как до правки; остальные значения уже являются процентными пунктами. Расчёт, лимиты, каталог и состояние заявки не менялись.

| File:line | Rate output |
|---|---|
| src/ui.tsx:283 | <strong>{formatRate(c.rate)}</strong> |
| src/Cabinet.tsx:127 | Ставка по модели <b>{formatRate(c.calculation.rate)}</b> |
| src/CabinetV2.tsx:981 | <strong>{formatRate(c.rate)} годовых</strong> |
| src/SelectionResult.tsx:139 | <b>{formatRate(c.rate)} годовых</b> |
| src/ApplicationStatus.tsx:301 | <p>Ставка: {formatRate(option.rate_annual_pct)} годовых</p> |
| src/ApplicationStatus.tsx:364 | {formatRate(offer.rate * 100)} годовых |
| src/manager/ManagerWorkspace.tsx:383 | мес. · {formatRate(option.rate_annual_pct)} годовых |

scripts/check-type.mjs:1: автономный измеритель без зависимостей, CSS в src и подкаталогах, inline fontSize во всех TSX, гистограмма, файл:строка, раскрытие :root-токенов и однозначных локальных токенов, контраст непрозрачных пар и альфа-композиция цвета текста. Порог 12 px и 4,5:1 сохраняется строгим; исключений размеров нет. Включены список неразрешённых пар и кандидаты с фиксированной высотой. Измеритель честно продолжает возвращать exit 1 при текущих цветах.

tests/qa/g4-type.test.ts:1: проверка exit 0 измерителя, отдельные проверки форматирования, реального рендера ставки и оффера с долевой ставкой, вложенного CSS, токенов, контраста и альфа-канала, семи ступеней и статических ограничений вёрстки. Красный тест приёмки не пропущен и не ослаблен.

<details>
<summary>Полный список изменённых размеров: файл:строка, старое значение, новая ступень</summary>

| File:line | Before | After |
|---|---|---|
| src/styles.css:36 | (new) | var(--text-base) |
| src/styles.css:89 | 42px | var(--text-3xl) |
| src/styles.css:94 | 26px | var(--text-xl) |
| src/styles.css:98 | 20px | var(--text-xl) |
| src/styles.css:133 | 12px | var(--text-xs) |
| src/styles.css:180 | 14px | var(--text-base) |
| src/styles.css:207 | 13px | var(--text-base) |
| src/styles.css:237 | 24px | var(--text-xl) |
| src/styles.css:247 | 17px | var(--text-lg) |
| src/styles.css:257 | 26px | var(--text-xl) |
| src/styles.css:279 | 8px | var(--text-xs) |
| src/styles.css:293 | 11px | var(--text-xs) |
| src/styles.css:309 | 10px | var(--text-xs) |
| src/styles.css:373 | 21px | var(--text-xl) |
| src/styles.css:377 | 13px | var(--text-base) |
| src/styles.css:385 | 13px | var(--text-base) |
| src/styles.css:400 | 11px | var(--text-sm) |
| src/styles.css:412 | 13px | var(--text-sm) |
| src/styles.css:461 | 13px | var(--text-sm) |
| src/styles.css:480 | 65px | var(--text-3xl) |
| src/styles.css:490 | 17px | var(--text-lg) |
| src/styles.css:508 | 11px | var(--text-sm) |
| src/styles.css:562 | 11px | var(--text-sm) |
| src/styles.css:578 | 11px | var(--text-xs) |
| src/styles.css:583 | 32px | var(--text-2xl) |
| src/styles.css:609 | 10px | var(--text-xs) |
| src/styles.css:617 | 9px | var(--text-sm) |
| src/styles.css:651 | 11px | var(--text-sm) |
| src/styles.css:656 | 9px | var(--text-xs) |
| src/styles.css:676 | 9px | var(--text-sm) |
| src/styles.css:701 | 12px | var(--text-sm) |
| src/styles.css:705 | 11px | var(--text-base) |
| src/styles.css:718 | 39px | var(--text-3xl) |
| src/styles.css:725 | 15px | var(--text-base) |
| src/styles.css:749 | 9px | var(--text-sm) |
| src/styles.css:756 | 25px | var(--text-xl) |
| src/styles.css:762 | 13px | var(--text-base) |
| src/styles.css:766 | 12px | var(--text-base) |
| src/styles.css:781 | 10px | var(--text-sm) |
| src/styles.css:788 | 11px | var(--text-sm) |
| src/styles.css:812 | 9px | var(--text-sm) |
| src/styles.css:818 | 10px | var(--text-sm) |
| src/styles.css:874 | 11px | var(--text-sm) |
| src/styles.css:897 | 12px | var(--text-sm) |
| src/styles.css:910 | 19px | var(--text-xl) |
| src/styles.css:913 | 13px | var(--text-base) |
| src/styles.css:934 | 31px | var(--text-2xl) |
| src/styles.css:938 | 14px | var(--text-base) |
| src/styles.css:963 | 15px | var(--text-base) |
| src/styles.css:975 | 13px | var(--text-base) |
| src/styles.css:990 | 38px | var(--text-2xl) |
| src/styles.css:997 | 13px | var(--text-base) |
| src/styles.css:1001 | 9px | var(--text-xs) |
| src/styles.css:1012 | 10px | var(--text-base) |
| src/styles.css:1018 | 14px | var(--text-sm) |
| src/styles.css:1040 | 11px | var(--text-sm) |
| src/styles.css:1063 | 33px | var(--text-2xl) |
| src/styles.css:1068 | 14px | var(--text-sm) |
| src/styles.css:1118 | 12px | var(--text-sm) |
| src/styles.css:1125 | 13px | var(--text-sm) |
| src/styles.css:1131 | 11px | var(--text-xs) |
| src/styles.css:1156 | 11px | var(--text-sm) |
| src/styles.css:1161 | 9px | var(--text-sm) |
| src/styles.css:1178 | 37px | var(--text-2xl) |
| src/styles.css:1199 | 12px | var(--text-base) |
| src/styles.css:1226 | 11px | var(--text-base) |
| src/styles.css:1257 | 16px | var(--text-lg) |
| src/styles.css:1270 | 12px | var(--text-base) |
| src/styles.css:1294 | 11px | var(--text-base) |
| src/styles.css:1312 | 9px | var(--text-sm) |
| src/styles.css:1336 | 31px | var(--text-2xl) |
| src/styles.css:1345 | 12px | var(--text-base) |
| src/styles.css:1350 | 9px | var(--text-xs) |
| src/styles.css:1365 | 11px | var(--text-sm) |
| src/styles.css:1371 | 10px | var(--text-xs) |
| src/styles.css:1418 | 10px | var(--text-sm) |
| src/styles.css:1431 | 9px | var(--text-xs) |
| src/styles.css:1436 | 35px | var(--text-2xl) |
| src/styles.css:1442 | 14px | var(--text-base) |
| src/styles.css:1470 | 14px | var(--text-sm) |
| src/styles.css:1474 | 10px | var(--text-base) |
| src/styles.css:1493 | 12px | var(--text-sm) |
| src/styles.css:1496 | 11px | var(--text-xs) |
| src/styles.css:1503 | 9px | var(--text-xs) |
| src/styles.css:1521 | 20px | var(--text-xl) |
| src/styles.css:1567 | 25px | var(--text-xl) |
| src/styles.css:1573 | 12px | var(--text-base) |
| src/styles.css:1579 | 12px | var(--text-base) |
| src/styles.css:1588 | 10px | var(--text-sm) |
| src/styles.css:1616 | 10px | var(--text-sm) |
| src/styles.css:1621 | 9px | var(--text-xs) |
| src/styles.css:1628 | 10px | var(--text-base) |
| src/styles.css:1646 | 11px | var(--text-xs) |
| src/styles.css:1652 | 31px | var(--text-2xl) |
| src/styles.css:1660 | 10px | var(--text-sm) |
| src/styles.css:1688 | 9px | var(--text-xs) |
| src/styles.css:1692 | 12px | var(--text-sm) |
| src/styles.css:1706 | 11px | var(--text-base) |
| src/styles.css:1725 | 29px | var(--text-2xl) |
| src/styles.css:1741 | 10px | var(--text-sm) |
| src/styles.css:1761 | 12px | var(--text-sm) |
| src/styles.css:1780 | 10px | var(--text-base) |
| src/styles.css:1789 | 29px | var(--text-2xl) |
| src/styles.css:1799 | 9px | var(--text-sm) |
| src/styles.css:1803 | 11px | var(--text-base) |
| src/styles.css:1811 | 11px | var(--text-base) |
| src/styles.css:1820 | 15px | var(--text-lg) |
| src/styles.css:1824 | 11px | var(--text-base) |
| src/styles.css:1829 | 11px | var(--text-base) |
| src/styles.css:1873 | 12px | var(--text-sm) |
| src/styles.css:1886 | 9px | var(--text-xs) |
| src/styles.css:1937 | 21px | var(--text-xl) |
| src/styles.css:1943 | 11px | var(--text-base) |
| src/styles.css:1950 | 8px | var(--text-xs) |
| src/styles.css:1967 | 10px | var(--text-base) |
| src/styles.css:2002 | 11px | var(--text-base) |
| src/styles.css:2021 | 8px | var(--text-xs) |
| src/styles.css:2026 | 8px | var(--text-xs) |
| src/styles.css:2035 | 11px | var(--text-sm) |
| src/styles.css:2038 | 10px | var(--text-base) |
| src/styles.css:2047 | 10px | var(--text-sm) |
| src/styles.css:2086 | 10px | var(--text-sm) |
| src/styles.css:2113 | 11px | var(--text-base) |
| src/styles.css:2132 | 8px | var(--text-xs) |
| src/styles.css:2156 | 11px | var(--text-base) |
| src/styles.css:2162 | 8px | var(--text-xs) |
| src/styles.css:2187 | 10px | var(--text-sm) |
| src/styles.css:2193 | 8px | var(--text-xs) |
| src/styles.css:2219 | 28px | var(--text-2xl) |
| src/styles.css:2222 | 13px | var(--text-base) |
| src/styles.css:2226 | 12px | var(--text-base) |
| src/styles.css:2229 | 13px | var(--text-base) |
| src/styles.css:2239 | 13px | var(--text-base) |
| src/styles.css:2242 | 9px | var(--text-xs) |
| src/styles.css:2246 | 11px | var(--text-base) |
| src/styles.css:2262 | 15px | var(--text-lg) |
| src/styles.css:2285 | 8px | var(--text-xs) |
| src/styles.css:2295 | 15px | var(--text-base) |
| src/styles.css:2298 | 10px | var(--text-base) |
| src/styles.css:2308 | 11px | var(--text-sm) |
| src/styles.css:2329 | 11px | var(--text-sm) |
| src/styles.css:2336 | 11px | var(--text-sm) |
| src/styles.css:2389 | 13px | var(--text-lg) |
| src/styles.css:2400 | 10px | var(--text-sm) |
| src/styles.css:2408 | 9px | var(--text-xs) |
| src/styles.css:2422 | 9px | var(--text-sm) |
| src/styles.css:2439 | 10px | var(--text-base) |
| src/styles.css:2444 | 9px | var(--text-base) |
| src/styles.css:2447 | 9px | var(--text-base) |
| src/styles.css:2457 | 8px | var(--text-sm) |
| src/styles.css:2467 | 8px | var(--text-sm) |
| src/styles.css:2477 | 9px | var(--text-sm) |
| src/styles.css:2483 | 11px | var(--text-base) |
| src/styles.css:2493 | 12px | var(--text-sm) |
| src/styles.css:2513 | 12px | var(--text-base) |
| src/styles.css:2523 | 8px | var(--text-xs) |
| src/styles.css:2534 | 36px | var(--text-2xl) |
| src/styles.css:2541 | 13px | var(--text-base) |
| src/styles.css:2550 | 11px | var(--text-base) |
| src/styles.css:2600 | 10px | var(--text-sm) |
| src/styles.css:2630 | 17px | var(--text-lg) |
| src/styles.css:2634 | 12px | var(--text-base) |
| src/styles.css:2659 | 11px | var(--text-sm) |
| src/styles.css:2667 | 11px | var(--text-sm) |
| src/styles.css:2670 | 10px | var(--text-sm) |
| src/styles.css:2690 | 27px | var(--text-2xl) |
| src/styles.css:2693 | 13px | var(--text-base) |
| src/styles.css:2713 | 12px | var(--text-sm) |
| src/styles.css:2719 | 10px | var(--text-xs) |
| src/styles.css:2737 | 12px | var(--text-base) |
| src/styles.css:2754 | 13px | var(--text-sm) |
| src/styles.css:2761 | 10px | var(--text-xs) |
| src/styles.css:2766 | 9px | var(--text-xs) |
| src/styles.css:2780 | 21px | var(--text-xl) |
| src/styles.css:2784 | 12px | var(--text-xs) |
| src/styles.css:2787 | 11px | var(--text-xs) |
| src/styles.css:2791 | 12px | var(--text-xs) |
| src/styles.css:2811 | 30px | var(--text-2xl) |
| src/styles.css:2817 | 12px | var(--text-base) |
| src/styles.css:2849 | 10px | var(--text-xs) |
| src/styles.css:2854 | 20px | var(--text-xl) |
| src/styles.css:2867 | 11px | var(--text-base) |
| src/styles.css:2875 | 11px | var(--text-sm) |
| src/styles.css:2892 | 9px | var(--text-xs) |
| src/styles.css:2896 | 12px | var(--text-sm) |
| src/styles.css:2910 | 11px | var(--text-sm) |
| src/styles.css:2946 | 10px | var(--text-xs) |
| src/styles.css:2950 | 27px | var(--text-2xl) |
| src/styles.css:2956 | 11px | var(--text-base) |
| src/styles.css:2972 | 13px | var(--text-lg) |
| src/styles.css:2976 | 11px | var(--text-base) |
| src/styles.css:2984 | 13px | var(--text-lg) |
| src/styles.css:2987 | 12px | var(--text-base) |
| src/styles.css:3000 | 11px | var(--text-base) |
| src/styles.css:3007 | 20px | var(--text-xl) |
| src/styles.css:3011 | 12px | var(--text-base) |
| src/styles.css:3024 | 11px | var(--text-sm) |
| src/styles.css:3039 | 20px | var(--text-xl) |
| src/styles.css:3043 | 12px | var(--text-base) |
| src/styles.css:3053 | 14px | var(--text-base) |
| src/styles.css:3056 | 8px | var(--text-xs) |
| src/styles.css:3060 | 9px | var(--text-base) |
| src/styles.css:3067 | 9px | var(--text-base) |
| src/styles.css:3074 | 8px | var(--text-base) |
| src/styles.css:3114 | 22px | var(--text-xl) |
| src/styles.css:3118 | 12px | var(--text-base) |
| src/styles.css:3132 | 12px | var(--text-base) |
| src/styles.css:3151 | 10px | var(--text-sm) |
| src/styles.css:3155 | 13px | var(--text-sm) |
| src/styles.css:3177 | 12px | var(--text-sm) |
| src/styles.css:3185 | 21px | var(--text-xl) |
| src/styles.css:3215 | 11px | var(--text-base) |
| src/styles.css:3230 | 26px | var(--text-xl) |
| src/styles.css:3233 | 13px | var(--text-base) |
| src/styles.css:3263 | 13px | var(--text-sm) |
| src/styles.css:3269 | 11px | var(--text-base) |
| src/styles.css:3276 | 10px | var(--text-base) |
| src/styles.css:3280 | 54px | var(--text-3xl) |
| src/styles.css:3292 | 12px | var(--text-base) |
| src/styles.css:3301 | 27px | var(--text-2xl) |
| src/styles.css:3304 | 9px | var(--text-sm) |
| src/styles.css:3311 | 10px | var(--text-sm) |
| src/styles.css:3314 | 9px | var(--text-base) |
| src/styles.css:3323 | 22px | var(--text-xl) |
| src/styles.css:3326 | 12px | var(--text-base) |
| src/styles.css:3332 | 27px | var(--text-2xl) |
| src/styles.css:3347 | 9px | var(--text-sm) |
| src/styles.css:3362 | 10px | var(--text-sm) |
| src/styles.css:3365 | 8px | var(--text-xs) |
| src/styles.css:3376 | 17px | var(--text-lg) |
| src/styles.css:3385 | 30px | var(--text-2xl) |
| src/styles.css:3394 | 31px | var(--text-2xl) |
| src/styles.css:3405 | 11px | var(--text-sm) |
| src/styles.css:3408 | 14px | var(--text-sm) |
| src/styles.css:3418 | 59px | var(--text-3xl) |
| src/styles.css:3470 | 32px | var(--text-2xl) |
| src/styles.css:3476 | 16px | var(--text-lg) |
| src/styles.css:3479 | 11px | var(--text-base) |
| src/styles.css:3498 | 29px | var(--text-2xl) |
| src/styles.css:3512 | 32px | var(--text-2xl) |
| src/styles.css:3541 | 13px | var(--text-sm) |
| src/styles.css:3560 | 13px | var(--text-base) |
| src/styles.css:3574 | 32px | var(--text-2xl) |
| src/styles.css:3605 | 15px | var(--text-lg) |
| src/styles.css:3608 | 11px | var(--text-base) |
| src/styles.css:3614 | 18px | var(--text-lg) |
| src/styles.css:3653 | 13px | var(--text-sm) |
| src/styles.css:3656 | 11px | var(--text-base) |
| src/styles.css:3666 | 43px | var(--text-3xl) |
| src/styles.css:3671 | 14px | var(--text-base) |
| src/styles.css:3679 | 11px | var(--text-base) |
| src/styles.css:3683 | 8px | var(--text-sm) |
| src/styles.css:3704 | 26px | var(--text-xl) |
| src/styles.css:3707 | 9px | var(--text-xs) |
| src/styles.css:3710 | 9px | var(--text-sm) |
| src/styles.css:3721 | 9px | var(--text-sm) |
| src/styles.css:3724 | 8px | var(--text-xs) |
| src/styles.css:3740 | 7px | var(--text-sm) |
| src/styles.css:3744 | 7px | var(--text-sm) |
| src/styles.css:3747 | 8px | var(--text-xs) |
| src/styles.css:3762 | 11px | var(--text-sm) |
| src/styles.css:3765 | 10px | var(--text-base) |
| src/styles.css:3773 | 30px | var(--text-2xl) |
| src/styles.css:3777 | 12px | var(--text-base) |
| src/styles.css:3780 | 8px | var(--text-xs) |
| src/styles.css:3799 | 24px | var(--text-xl) |
| src/styles.css:3802 | 12px | var(--text-base) |
| src/styles.css:3834 | 10px | var(--text-sm) |
| src/styles.css:3837 | 18px | var(--text-lg) |
| src/styles.css:3840 | 12px | var(--text-base) |
| src/styles.css:3849 | 27px | var(--text-2xl) |
| src/styles.css:3852 | 12px | var(--text-base) |
| src/styles.css:3858 | 9px | var(--text-xs) |
| src/styles.css:3861 | 13px | var(--text-base) |
| src/styles.css:3864 | 11px | var(--text-base) |
| src/styles.css:3874 | 29px | var(--text-2xl) |
| src/styles.css:3877 | 12px | var(--text-base) |
| src/styles.css:3885 | 12px | var(--text-sm) |
| src/styles.css:3888 | 8px | var(--text-base) |
| src/styles.css:3898 | 28px | var(--text-2xl) |
| src/styles.css:3901 | 12px | var(--text-sm) |
| src/styles.css:3908 | 12px | var(--text-sm) |
| src/styles.css:3911 | 10px | var(--text-xs) |
| src/styles.css:3921 | 12px | var(--text-sm) |
| src/styles.css:3927 | 10px | var(--text-base) |
| src/styles.css:3938 | 10px | var(--text-sm) |
| src/styles.css:3942 | 6px | var(--text-xs) |
| src/styles.css:3949 | 22px | var(--text-xl) |
| src/styles.css:3970 | 8px | var(--text-base) |
| src/styles.css:3985 | 7px | var(--text-sm) |
| src/styles.css:3999 | 27px | var(--text-2xl) |
| src/styles.css:4003 | 10px | var(--text-base) |
| src/styles.css:4008 | 7px | var(--text-xs) |
| src/styles.css:4020 | 17px | var(--text-lg) |
| src/styles.css:4023 | 8px | var(--text-xs) |
| src/styles.css:4033 | 24px | var(--text-xl) |
| src/styles.css:4036 | 11px | var(--text-base) |
| src/styles.css:4039 | 11px | var(--text-base) |
| src/styles.css:4043 | 8px | var(--text-sm) |
| src/styles.css:4063 | 10px | var(--text-sm) |
| src/styles.css:4066 | 8px | var(--text-xs) |
| src/styles.css:4070 | 10px | var(--text-base) |
| src/styles.css:4079 | 11px | var(--text-sm) |
| src/styles.css:4082 | 8px | var(--text-xs) |
| src/styles.css:4100 | 11px | var(--text-base) |
| src/styles.css:4109 | 29px | var(--text-2xl) |
| src/styles.css:4112 | 11px | var(--text-base) |
| src/styles.css:4116 | 7px | var(--text-xs) |
| src/styles.css:4119 | 18px | var(--text-lg) |
| src/styles.css:4122 | 9px | var(--text-base) |
| src/styles.css:4134 | 13px | var(--text-lg) |
| src/styles.css:4144 | 9px | var(--text-base) |
| src/styles.css:4149 | 7px | var(--text-xs) |
| src/styles.css:4152 | 13px | var(--text-base) |
| src/styles.css:4155 | 10px | var(--text-sm) |
| src/styles.css:4163 | 10px | var(--text-sm) |
| src/styles.css:4167 | 10px | var(--text-sm) |
| src/styles.css:4177 | 11px | var(--text-lg) |
| src/styles.css:4181 | 9px | var(--text-sm) |
| src/styles.css:4184 | 8px | var(--text-xs) |
| src/styles.css:4191 | 9px | var(--text-base) |
| src/styles.css:4197 | 8px | var(--text-base) |
| src/styles.css:4200 | 8px | var(--text-sm) |
| src/styles.css:4208 | 7px | var(--text-sm) |
| src/styles.css:4213 | 7px | var(--text-sm) |
| src/styles.css:4216 | 18px | var(--text-lg) |
| src/styles.css:4219 | 10px | var(--text-base) |
| src/styles.css:4222 | 8px | var(--text-xs) |
| src/styles.css:4225 | 8px | var(--text-sm) |
| src/styles.css:4233 | 10px | var(--text-base) |
| src/styles.css:4241 | 29px | var(--text-2xl) |
| src/styles.css:4245 | 11px | var(--text-base) |
| src/styles.css:4255 | 8px | var(--text-sm) |
| src/styles.css:4278 | 17px | var(--text-lg) |
| src/styles.css:4281 | 11px | var(--text-base) |
| src/styles.css:4292 | 8px | var(--text-sm) |
| src/styles.css:4300 | 8px | var(--text-sm) |
| src/styles.css:4304 | 24px | var(--text-xl) |
| src/styles.css:4307 | 11px | var(--text-base) |
| src/styles.css:4319 | 11px | var(--text-sm) |
| src/styles.css:4322 | 9px | var(--text-xs) |
| src/styles.css:4330 | 11px | var(--text-base) |
| src/styles.css:4334 | 10px | var(--text-xs) |
| src/styles.css:4337 | 10px | var(--text-base) |
| src/styles.css:4342 | 11px | var(--text-sm) |
| src/styles.css:4354 | 24px | var(--text-xl) |
| src/styles.css:4357 | 10px | var(--text-base) |
| src/styles.css:4360 | 8px | var(--text-xs) |
| src/styles.css:4379 | 18px | var(--text-lg) |
| src/styles.css:4382 | 9px | var(--text-xs) |
| src/styles.css:4390 | 27px | var(--text-2xl) |
| src/styles.css:4393 | 10px | var(--text-base) |
| src/styles.css:4399 | 10px | var(--text-base) |
| src/styles.css:4406 | 11px | var(--text-base) |
| src/styles.css:4409 | 8px | var(--text-xs) |
| src/styles.css:4412 | 10px | var(--text-base) |
| src/styles.css:4419 | 11px | var(--text-sm) |
| src/styles.css:4422 | 8px | var(--text-xs) |
| src/styles.css:4425 | 8px | var(--text-xs) |
| src/styles.css:4433 | 19px | var(--text-xl) |
| src/styles.css:4436 | 10px | var(--text-base) |
| src/styles.css:4441 | 18px | var(--text-lg) |
| src/styles.css:4444 | 7px | var(--text-xs) |
| src/styles.css:4448 | 9px | var(--text-sm) |
| src/styles.css:4451 | 26px | var(--text-xl) |
| src/styles.css:4454 | 9px | var(--text-xs) |
| src/styles.css:4460 | 8px | var(--text-xs) |
| src/styles.css:4463 | 10px | var(--text-sm) |
| src/styles.css:4466 | 26px | var(--text-xl) |
| src/styles.css:4469 | 9px | var(--text-xs) |
| src/styles.css:4472 | 9px | var(--text-sm) |
| src/styles.css:4475 | 11px | var(--text-sm) |
| src/styles.css:4478 | 29px | var(--text-2xl) |
| src/styles.css:4481 | 9px | var(--text-sm) |
| src/styles.css:4484 | 14px | var(--text-lg) |
| src/styles.css:4487 | 10px | var(--text-base) |
| src/styles.css:4493 | 8px | var(--text-sm) |
| src/styles.css:4522 | 11px | var(--text-base) |
| src/styles.css:4531 | 25px | var(--text-xl) |
| src/styles.css:4534 | 12px | var(--text-base) |
| src/styles.css:4537 | 11px | var(--text-base) |
| src/styles.css:4540 | 8px | var(--text-xs) |
| src/styles.css:4561 | 20px | var(--text-xl) |
| src/styles.css:4567 | 10px | var(--text-base) |
| src/styles.css:4579 | 9px | var(--text-sm) |
| src/styles.css:4582 | 11px | var(--text-sm) |
| src/styles.css:4589 | 25px | var(--text-xl) |
| src/styles.css:4592 | 12px | var(--text-base) |
| src/styles.css:4597 | 11px | var(--text-sm) |
| src/styles.css:4604 | 9px | var(--text-sm) |
| src/styles.css:4616 | 10px | var(--text-base) |
| src/redesign.css:13 | 14px | var(--text-base) |
| src/redesign.css:32 | 26px | var(--text-xl) |
| src/redesign.css:106 | 13px | var(--text-base) |
| src/redesign.css:109 | 16px | var(--text-lg) |
| src/redesign.css:127 | 10px | var(--text-sm) |
| src/redesign.css:134 | 11px | var(--text-base) |
| src/redesign.css:148 | 28px | var(--text-2xl) |
| src/redesign.css:153 | 14px | var(--text-base) |
| src/redesign.css:177 | 23px | var(--text-xl) |
| src/redesign.css:183 | 12px | var(--text-sm) |
| src/redesign.css:187 | 12px | var(--text-base) |
| src/redesign.css:252 | 17px | var(--text-lg) |
| src/redesign.css:277 | clamp(22px, 2vw, 30px) | var(--text-xl) |
| src/redesign.css:285 | 12px | var(--text-xs) |
| src/redesign.css:289 | 11px | var(--text-sm) |
| src/redesign.css:304 | 12px | var(--text-base) |
| src/redesign.css:325 | 19px | var(--text-xl) |
| src/redesign.css:329 | 14px | var(--text-base) |
| src/redesign.css:335 | 12px | var(--text-sm) |
| src/redesign.css:367 | 13px | var(--text-sm) |
| src/redesign.css:383 | 18px | var(--text-lg) |
| src/redesign.css:393 | 10px | var(--text-xs) |
| src/redesign.css:410 | 12px | var(--text-xs) |
| src/redesign.css:414 | clamp(23px, 2.1vw, 34px) | var(--text-xl) |
| src/redesign.css:419 | 23px | var(--text-xl) |
| src/redesign.css:435 | 12px | var(--text-sm) |
| src/redesign.css:439 | 12px | var(--text-base) |
| src/redesign.css:449 | 11px | var(--text-sm) |
| src/redesign.css:462 | 32px | var(--text-2xl) |
| src/redesign.css:467 | 12px | var(--text-sm) |
| src/redesign.css:488 | 13px | var(--text-base) |
| src/redesign.css:491 | 11px | var(--text-xs) |
| src/redesign.css:497 | 12px | var(--text-base) |
| src/redesign.css:503 | 32px | var(--text-2xl) |
| src/redesign.css:513 | 16px | var(--text-lg) |
| src/redesign.css:517 | 13px | var(--text-base) |
| src/redesign.css:522 | 12px | var(--text-base) |
| src/redesign.css:543 | 12px | var(--text-base) |
| src/redesign.css:598 | 13px | var(--text-sm) |
| src/redesign.css:602 | 10px | var(--text-xs) |
| src/redesign.css:610 | 12px | var(--text-sm) |
| src/redesign.css:631 | 12px | var(--text-base) |
| src/redesign.css:635 | 12px | var(--text-sm) |
| src/redesign.css:638 | 10px | var(--text-xs) |
| src/redesign.css:644 | 12px | var(--text-sm) |
| src/redesign.css:682 | 24px | var(--text-xl) |
| src/redesign.css:688 | 13px | var(--text-base) |
| src/redesign.css:696 | 12px | var(--text-base) |
| src/redesign.css:708 | 14px | var(--text-base) |
| src/redesign.css:727 | 10px | var(--text-xs) |
| src/redesign.css:730 | 9px | var(--text-xs) |
| src/redesign.css:743 | 17px | var(--text-lg) |
| src/redesign.css:758 | 0.9em | var(--text-base) |
| src/redesign.css:767 | 12px | var(--text-base) |
| src/redesign.css:776 | 16px | var(--text-lg) |
| src/redesign.css:795 | 12px | var(--text-sm) |
| src/redesign.css:815 | 14px | var(--text-base) |
| src/redesign.css:827 | 10px | var(--text-xs) |
| src/redesign.css:863 | 20px | var(--text-xl) |
| src/redesign.css:867 | 13px | var(--text-base) |
| src/redesign.css:876 | 12px | var(--text-base) |
| src/redesign.css:888 | 12px | var(--text-base) |
| src/redesign.css:913 | 34px | var(--text-2xl) |
| src/redesign.css:918 | 14px | var(--text-sm) |
| src/redesign.css:925 | 12px | var(--text-sm) |
| src/redesign.css:941 | 15px | var(--text-base) |
| src/redesign.css:969 | 13px | var(--text-sm) |
| src/redesign.css:973 | 12px | var(--text-xs) |
| src/redesign.css:981 | 17px | var(--text-lg) |
| src/redesign.css:1003 | 14px | var(--text-base) |
| src/redesign.css:1010 | 12px | var(--text-sm) |
| src/redesign.css:1018 | 16px | var(--text-lg) |
| src/redesign.css:1023 | 13px | var(--text-base) |
| src/redesign.css:1027 | 11px | var(--text-sm) |
| src/redesign.css:1034 | 12px | var(--text-base) |
| src/redesign.css:1086 | 27px | var(--text-2xl) |
| src/redesign.css:1092 | 13px | var(--text-base) |
| src/redesign.css:1095 | 11px | var(--text-sm) |
| src/redesign.css:1100 | 12px | var(--text-sm) |
| src/redesign.css:1109 | 13px | var(--text-sm) |
| src/redesign.css:1116 | 25px | var(--text-xl) |
| src/redesign.css:1128 | 14px | var(--text-sm) |
| src/redesign.css:1170 | 11px | var(--text-sm) |
| src/redesign.css:1173 | 11px | var(--text-xs) |
| src/redesign.css:1191 | 11px | var(--text-xs) |
| src/redesign.css:1195 | 32px | var(--text-2xl) |
| src/redesign.css:1200 | 14px | var(--text-sm) |
| src/redesign.css:1215 | 13px | var(--text-xs) |
| src/redesign.css:1222 | clamp(25px, 3vw, 43px) | var(--text-xl) |
| src/redesign.css:1228 | 12px | var(--text-base) |
| src/redesign.css:1252 | 11px | var(--text-sm) |
| src/redesign.css:1273 | 12px | var(--text-xs) |
| src/redesign.css:1278 | 20px | var(--text-xl) |
| src/redesign.css:1303 | 18px | var(--text-lg) |
| src/redesign.css:1307 | 12px | var(--text-base) |
| src/redesign.css:1320 | 15px | var(--text-lg) |
| src/redesign.css:1325 | 13px | var(--text-sm) |
| src/redesign.css:1335 | 12px | var(--text-base) |
| src/redesign.css:1345 | 13px | var(--text-base) |
| src/redesign.css:1355 | 12px | var(--text-base) |
| src/redesign.css:1358 | 13px | var(--text-sm) |
| src/redesign.css:1379 | 32px | var(--text-2xl) |
| src/redesign.css:1383 | 14px | var(--text-base) |
| src/redesign.css:1392 | 13px | var(--text-sm) |
| src/redesign.css:1398 | 11px | var(--text-sm) |
| src/redesign.css:1437 | 15px | var(--text-lg) |
| src/redesign.css:1445 | 14px | var(--text-base) |
| src/redesign.css:1451 | 10px | var(--text-base) |
| src/redesign.css:1504 | 12px | var(--text-base) |
| src/redesign.css:1553 | 14px | var(--text-sm) |
| src/redesign.css:1587 | 11px | var(--text-base) |
| src/redesign.css:1602 | 12px | var(--text-sm) |
| src/redesign.css:1620 | 13px | var(--text-base) |
| src/redesign.css:1634 | 12px | var(--text-sm) |
| src/redesign.css:1637 | 24px | var(--text-xl) |
| src/redesign.css:1640 | 5px | var(--text-xs) |
| src/redesign.css:1685 | 21px | var(--text-xl) |
| src/redesign.css:1691 | 11px | var(--text-base) |
| src/redesign.css:1714 | 17px | var(--text-lg) |
| src/redesign.css:1720 | 24px | var(--text-xl) |
| src/redesign.css:1723 | 11px | var(--text-xs) |
| src/redesign.css:1726 | 22px | var(--text-xl) |
| src/redesign.css:1729 | 29px | var(--text-2xl) |
| src/redesign.css:1732 | 11px | var(--text-sm) |
| src/redesign.css:1737 | 9px | var(--text-xs) |
| src/redesign.css:1741 | 9px | var(--text-sm) |
| src/redesign.css:1748 | 10px | var(--text-base) |
| src/redesign.css:1762 | 12px | var(--text-sm) |
| src/redesign.css:1766 | 9px | var(--text-xs) |
| src/redesign.css:1773 | 11px | var(--text-sm) |
| src/redesign.css:1799 | 13px | var(--text-base) |
| src/redesign.css:1813 | 22px | var(--text-xl) |
| src/redesign.css:1816 | 12px | var(--text-base) |
| src/redesign.css:1822 | 14px | var(--text-base) |
| src/redesign.css:1825 | 9px | var(--text-xs) |
| src/redesign.css:1828 | 11px | var(--text-sm) |
| src/redesign.css:1835 | 25px | var(--text-xl) |
| src/redesign.css:1838 | 13px | var(--text-base) |
| src/redesign.css:1844 | 23px | var(--text-xl) |
| src/redesign.css:1862 | 10px | var(--text-sm) |
| src/redesign.css:1871 | 10px | var(--text-sm) |
| src/redesign.css:1877 | 26px | var(--text-xl) |
| src/redesign.css:1885 | 13px | var(--text-sm) |
| src/redesign.css:1894 | 32px | var(--text-2xl) |
| src/redesign.css:1897 | 12px | var(--text-xs) |
| src/redesign.css:1912 | 18px | var(--text-lg) |
| src/redesign.css:1915 | 11px | var(--text-xs) |
| src/redesign.css:1922 | 17px | var(--text-lg) |
| src/redesign.css:1942 | 28px | var(--text-2xl) |
| src/redesign.css:1945 | 13px | var(--text-sm) |
| src/redesign.css:1955 | 11px | var(--text-base) |
| src/redesign.css:1958 | 13px | var(--text-sm) |
| src/redesign.css:1972 | 14px | var(--text-sm) |
| src/redesign.css:1975 | 12px | var(--text-sm) |
| src/redesign.css:1978 | 15px | var(--text-base) |
| src/redesign.css:1990 | 10px | var(--text-sm) |
| src/redesign.css:2000 | 27px | var(--text-2xl) |
| src/redesign.css:2003 | 13px | var(--text-base) |
| src/redesign.css:2011 | 9px | var(--text-xs) |
| src/redesign.css:2015 | 11px | var(--text-base) |
| src/redesign.css:2018 | 13px | var(--text-sm) |
| src/redesign.css:2033 | 13px | var(--text-lg) |
| src/redesign.css:2046 | 11px | var(--text-base) |
| src/redesign.css:2053 | 9px | var(--text-base) |
| src/redesign.css:2056 | 11px | var(--text-base) |
| src/motion.css:139 | 10px | var(--text-sm) |
| src/motion.css:168 | 11px | var(--text-sm) |
| src/motion.css:177 | clamp(24px, 2.8vw, 37px) | var(--text-xl) |
| src/motion.css:188 | 10px | var(--text-base) |
| src/motion.css:210 | 9px | var(--text-sm) |
| src/motion.css:237 | 11px | var(--text-sm) |
| src/motion.css:242 | 9px | var(--text-xs) |
| src/motion.css:270 | 10px | var(--text-base) |
| src/motion.css:275 | 8px | var(--text-base) |
| src/motion.css:303 | 9px | var(--text-sm) |
| src/motion.css:564 | 9px | var(--text-sm) |
| src/motion.css:691 | 57px | var(--text-3xl) |
| src/motion.css:698 | 21px | var(--text-xl) |
| src/motion.css:704 | 9px | var(--text-xs) |
| src/motion.css:712 | clamp(25px, 4vw, 34px) | var(--text-xl) |
| src/motion.css:726 | 12px | var(--text-base) |
| src/motion.css:759 | 12px | var(--text-sm) |
| src/motion.css:764 | 12px | var(--text-sm) |
| src/motion.css:770 | 13px | var(--text-sm) |
| src/motion.css:777 | 10px | var(--text-sm) |
| src/motion.css:834 | 10px | var(--text-sm) |
| src/motion.css:838 | 9px | var(--text-sm) |
| src/motion.css:849 | 8px | var(--text-sm) |
| src/chat.css:60 | 11px | var(--text-sm) |
| src/chat.css:63 | 11px | var(--text-base) |
| src/chat.css:118 | 13px | var(--text-sm) |
| src/chat.css:196 | 12px | var(--text-sm) |
| src/chat.css:223 | 12px | var(--text-sm) |
| src/chat.css:241 | 10px | var(--text-sm) |
| src/chat.css:280 | 12px | var(--text-base) |
| src/chat.css:291 | 9px | var(--text-xs) |
| src/chat.css:307 | 12px | var(--text-sm) |
| src/chat.css:381 | 30px | var(--text-2xl) |
| src/chat.css:391 | 13px | var(--text-base) |
| src/chat.css:413 | 11px | var(--text-base) |
| src/chat.css:436 | 10px | var(--text-base) |
| src/chat.css:466 | 14px | var(--text-base) |
| src/chat.css:497 | 9px | var(--text-xs) |
| src/chat.css:508 | 9px | var(--text-xs) |
| src/chat.css:521 | 16px | var(--text-lg) |
| src/chat.css:561 | 16px | var(--text-lg) |
| src/chat.css:566 | 10px | var(--text-xs) |
| src/chat.css:570 | 12px | var(--text-base) |
| src/chat.css:574 | 11px | var(--text-sm) |
| src/chat.css:578 | 10px | var(--text-xs) |
| src/chat.css:581 | 12px | var(--text-sm) |
| src/chat.css:588 | 12px | var(--text-sm) |
| src/chat.css:594 | 11px | var(--text-base) |
| src/chat.css:617 | 12px | var(--text-sm) |
| src/chat.css:634 | 11px | var(--text-base) |
| src/chat.css:647 | 12px | var(--text-sm) |
| src/chat.css:714 | 14px | var(--text-base) |
| src/chat.css:776 | 10px | var(--text-sm) |
| src/chat.css:783 | 9px | var(--text-xs) |
| src/chat.css:821 | 10px | var(--text-sm) |
| src/chat.css:829 | 8px | var(--text-xs) |
| src/chat.css:860 | 23px | var(--text-xl) |
| src/chat.css:864 | 12px | var(--text-base) |
| src/chat.css:867 | 10px | var(--text-base) |
| src/chat.css:870 | 13px | var(--text-base) |
| src/chat.css:903 | 16px | var(--text-lg) |
| src/chat.css:942 | 10px | var(--text-xs) |
| src/chat.css:953 | 13px | var(--text-sm) |
| src/chat.css:964 | 12px | var(--text-base) |
| src/cabinet.css:15 | 12px | var(--text-sm) |
| src/cabinet.css:41 | 12px | var(--text-base) |
| src/cabinet.css:46 | 11px | var(--text-sm) |
| src/cabinet.css:97 | 9px | var(--text-xs) |
| src/cabinet.css:102 | 27px | var(--text-2xl) |
| src/cabinet.css:108 | 11px | var(--text-sm) |
| src/cabinet.css:121 | 16px | var(--text-lg) |
| src/cabinet.css:136 | 11px | var(--text-base) |
| src/cabinet.css:151 | 9px | var(--text-sm) |
| src/cabinet.css:162 | 11px | var(--text-xs) |
| src/cabinet.css:167 | 42px | var(--text-3xl) |
| src/cabinet.css:183 | 10px | var(--text-sm) |
| src/cabinet.css:190 | 13px | var(--text-sm) |
| src/cabinet.css:216 | 10px | var(--text-xs) |
| src/cabinet.css:222 | 10px | var(--text-sm) |
| src/cabinet.css:231 | 11px | var(--text-base) |
| src/cabinet.css:238 | 11px | var(--text-base) |
| src/cabinet.css:243 | 12px | var(--text-base) |
| src/cabinet.css:256 | 11px | var(--text-base) |
| src/cabinet.css:261 | 10px | var(--text-base) |
| src/cabinet.css:272 | 33px | var(--text-2xl) |
| src/cabinet.css:296 | 11px | var(--text-base) |
| src/cabinet.css:314 | 10px | var(--text-sm) |
| src/cabinet.css:332 | 9px | var(--text-xs) |
| src/cabinet.css:369 | 21px | var(--text-xl) |
| src/cabinet.css:2008 | 19px | var(--text-xl) |
| src/cabinet.css:377 | 18px | var(--text-lg) |
| src/cabinet.css:2035 | 18px | var(--text-lg) |
| src/cabinet.css:381 | 8px | var(--text-sm) |
| src/cabinet.css:391 | 8px | var(--text-sm) |
| src/cabinet.css:404 | 9px | var(--text-sm) |
| src/cabinet.css:420 | 11px | var(--text-sm) |
| src/cabinet.css:425 | 9px | var(--text-xs) |
| src/cabinet.css:441 | 13px | var(--text-lg) |
| src/cabinet.css:447 | 11px | var(--text-base) |
| src/cabinet.css:473 | 29px | var(--text-2xl) |
| src/cabinet.css:484 | 10px | var(--text-sm) |
| src/cabinet.css:490 | 11px | var(--text-sm) |
| src/cabinet.css:514 | 11px | var(--text-base) |
| src/cabinet.css:532 | 9px | var(--text-sm) |
| src/cabinet.css:537 | 11px | var(--text-sm) |
| src/cabinet.css:560 | 10px | var(--text-sm) |
| src/cabinet.css:581 | 10px | var(--text-xs) |
| src/cabinet.css:591 | 22px | var(--text-xl) |
| src/cabinet.css:598 | 9px | var(--text-sm) |
| src/cabinet.css:623 | 9px | var(--text-xs) |
| src/cabinet.css:648 | 12px | var(--text-sm) |
| src/cabinet.css:652 | 11px | var(--text-base) |
| src/cabinet.css:658 | 9px | var(--text-xs) |
| src/cabinet.css:671 | 11px | var(--text-base) |
| src/cabinet.css:675 | 10px | var(--text-sm) |
| src/cabinet.css:683 | 11px | var(--text-sm) |
| src/cabinet.css:688 | 12px | var(--text-sm) |
| src/cabinet.css:694 | 12px | var(--text-sm) |
| src/cabinet.css:714 | 13px | var(--text-base) |
| src/cabinet.css:735 | 11px | var(--text-sm) |
| src/cabinet.css:741 | 14px | var(--text-lg) |
| src/cabinet.css:761 | 14px | var(--text-sm) |
| src/cabinet.css:781 | 10px | var(--text-xs) |
| src/cabinet.css:791 | 12px | var(--text-base) |
| src/cabinet.css:820 | 11px | var(--text-xs) |
| src/cabinet.css:824 | 24px | var(--text-xl) |
| src/cabinet.css:829 | 11px | var(--text-base) |
| src/cabinet.css:834 | 26px | var(--text-xl) |
| src/cabinet.css:838 | 13px | var(--text-base) |
| src/cabinet.css:847 | 10px | var(--text-sm) |
| src/cabinet.css:851 | 12px | var(--text-sm) |
| src/cabinet.css:867 | 8px | var(--text-xs) |
| src/cabinet.css:903 | 17px | var(--text-lg) |
| src/cabinet.css:908 | 10px | var(--text-xs) |
| src/cabinet.css:919 | 9px | var(--text-xs) |
| src/cabinet.css:925 | 10px | var(--text-base) |
| src/cabinet.css:963 | 12px | var(--text-lg) |
| src/cabinet.css:969 | 11px | var(--text-base) |
| src/cabinet.css:976 | 9px | var(--text-xs) |
| src/cabinet.css:991 | 10px | var(--text-base) |
| src/cabinet.css:1000 | 14px | var(--text-lg) |
| src/cabinet.css:1004 | 11px | var(--text-base) |
| src/cabinet.css:1012 | 24px | var(--text-xl) |
| src/cabinet.css:1019 | 32px | var(--text-2xl) |
| src/cabinet.css:1022 | 27px | var(--text-2xl) |
| src/cabinet.css:1037 | 14px | var(--text-lg) |
| src/cabinet.css:1096 | 8px | var(--text-sm) |
| src/cabinet.css:1099 | 10px | var(--text-sm) |
| src/cabinet.css:1177 | 18px | var(--text-lg) |
| src/cabinet.css:1186 | 12px | var(--text-xs) |
| src/cabinet.css:1197 | 26px | var(--text-xl) |
| src/cabinet.css:1205 | 26px | var(--text-xl) |
| src/cabinet.css:1228 | 12px | var(--text-sm) |
| src/cabinet.css:1233 | 17px | var(--text-lg) |
| src/cabinet.css:1374 | 11px | var(--text-sm) |
| src/cabinet.css:1398 | 12px | var(--text-base) |
| src/cabinet.css:1431 | 12px | var(--text-base) |
| src/cabinet.css:1489 | 12px | var(--text-base) |
| src/cabinet.css:1501 | 14px | var(--text-lg) |
| src/cabinet.css:1554 | 11px | var(--text-base) |
| src/cabinet.css:1562 | 12px | var(--text-base) |
| src/cabinet.css:1584 | 10px | var(--text-base) |
| src/cabinet.css:1592 | 12px | var(--text-base) |
| src/cabinet.css:1603 | 15px | var(--text-base) |
| src/cabinet.css:1607 | 32px | var(--text-2xl) |
| src/cabinet.css:1612 | 12px | var(--text-sm) |
| src/cabinet.css:1617 | 13px | var(--text-sm) |
| src/cabinet.css:1620 | 12px | var(--text-base) |
| src/cabinet.css:1624 | 12px | var(--text-base) |
| src/cabinet.css:1628 | 12px | var(--text-base) |
| src/cabinet.css:1634 | 12px | var(--text-base) |
| src/cabinet.css:1637 | 12px | var(--text-base) |
| src/cabinet.css:1653 | 9px | var(--text-sm) |
| src/cabinet.css:1672 | 10px | var(--text-sm) |
| src/cabinet.css:1685 | 12px | var(--text-sm) |
| src/cabinet.css:1695 | 12px | var(--text-sm) |
| src/cabinet.css:1710 | 11px | var(--text-xs) |
| src/cabinet.css:1730 | 25px | var(--text-xl) |
| src/cabinet.css:1735 | 11px | var(--text-sm) |
| src/cabinet.css:1779 | 10px | var(--text-xs) |
| src/cabinet.css:1793 | 12px | var(--text-base) |
| src/cabinet.css:1844 | 15px | var(--text-lg) |
| src/cabinet.css:1850 | 12px | var(--text-base) |
| src/cabinet.css:1856 | 10px | var(--text-sm) |
| src/cabinet.css:1868 | 10px | var(--text-sm) |
| src/cabinet.css:1890 | 16px | var(--text-lg) |
| src/cabinet.css:1913 | 12px | var(--text-base) |
| src/cabinet.css:1929 | 20px | var(--text-xl) |
| src/cabinet.css:1933 | 11px | var(--text-base) |
| src/cabinet.css:1936 | 10px | var(--text-sm) |
| src/cabinet.css:1950 | 24px | var(--text-xl) |
| src/cabinet.css:1975 | 17px | var(--text-lg) |
| src/cabinet.css:1997 | 14px | var(--text-lg) |
| src/cabinet.css:2014 | 10px | var(--text-xs) |
| src/cabinet.css:2032 | 9px | var(--text-xs) |
| src/cabinet.css:2045 | 8px | var(--text-xs) |
| src/financing.css:21 | 27px | var(--text-2xl) |
| src/financing.css:28 | 13px | var(--text-base) |
| src/financing.css:32 | 12px | var(--text-sm) |
| src/financing.css:49 | 25px | var(--text-xl) |
| src/financing.css:54 | 15px | var(--text-lg) |
| src/financing.css:63 | 13px | var(--text-base) |
| src/financing.css:70 | 12px | var(--text-sm) |
| src/financing.css:74 | 11px | var(--text-xs) |
| src/financing.css:98 | 12px | var(--text-sm) |
| src/financing.css:113 | 11px | var(--text-sm) |
| src/financing.css:170 | 14px | var(--text-sm) |
| src/financing.css:176 | 11px | var(--text-xs) |
| src/financing.css:211 | 12px | var(--text-sm) |
| src/financing.css:226 | 12px | var(--text-base) |
| src/financing.css:235 | 12px | var(--text-base) |
| src/financing.css:242 | 13px | var(--text-base) |
| src/financing.css:259 | 10px | var(--text-xs) |
| src/financing.css:280 | 11px | var(--text-xs) |
| src/financing.css:302 | 11px | var(--text-xs) |
| src/financing.css:307 | 13px | var(--text-sm) |
| src/financing.css:323 | 9px | var(--text-xs) |
| src/financing.css:327 | 10px | var(--text-xs) |
| src/financing.css:336 | 12px | var(--text-sm) |
| src/financing.css:347 | 10px | var(--text-xs) |
| src/financing.css:350 | 12px | var(--text-sm) |
| src/financing.css:366 | 13px | var(--text-sm) |
| src/financing.css:369 | 11px | var(--text-base) |
| src/financing.css:377 | 11px | var(--text-sm) |
| src/financing.css:387 | 12px | var(--text-sm) |
| src/financing.css:404 | 13px | var(--text-sm) |
| src/financing.css:409 | 11px | var(--text-xs) |
| src/financing.css:420 | 11px | var(--text-sm) |
| src/financing.css:436 | 29px | var(--text-2xl) |
| src/financing.css:440 | 13px | var(--text-sm) |
| src/financing.css:448 | 29px | var(--text-2xl) |
| src/financing.css:452 | 12px | var(--text-xs) |
| src/financing.css:465 | 10px | var(--text-sm) |
| src/financing.css:470 | 10px | var(--text-sm) |
| src/financing.css:484 | 11px | var(--text-xs) |
| src/financing.css:489 | 18px | var(--text-lg) |
| src/financing.css:519 | 11px | var(--text-base) |
| src/financing.css:531 | 12px | var(--text-sm) |
| src/financing.css:548 | 12px | var(--text-sm) |
| src/financing.css:572 | 9px | var(--text-xs) |
| src/financing.css:582 | 11px | var(--text-sm) |
| src/financing.css:587 | 10px | var(--text-xs) |
| src/financing.css:597 | 11px | var(--text-base) |
| src/financing.css:604 | 11px | var(--text-sm) |
| src/financing.css:641 | 12px | var(--text-sm) |
| src/financing.css:644 | 11px | var(--text-sm) |
| src/financing.css:663 | 11px | var(--text-sm) |
| src/financing.css:674 | 12px | var(--text-sm) |
| src/financing.css:689 | 11px | var(--text-base) |
| src/financing.css:698 | 12px | var(--text-sm) |
| src/financing.css:707 | 12px | var(--text-base) |
| src/financing.css:717 | 11px | var(--text-sm) |
| src/financing.css:722 | 15px | var(--text-base) |
| src/financing.css:734 | 12px | var(--text-base) |
| src/financing.css:768 | 23px | var(--text-xl) |
| src/financing.css:782 | 11px | var(--text-xs) |
| src/financing.css:786 | 10px | var(--text-sm) |
| src/financing.css:802 | 22px | var(--text-xl) |
| src/financing.css:810 | 11px | var(--text-base) |
| src/financing.css:832 | 25px | var(--text-xl) |
| src/financing.css:843 | 17px | var(--text-lg) |
| src/financing.css:849 | 9px | var(--text-xs) |
| src/financing.css:852 | 9px | var(--text-xs) |
| src/application-status.css:36 | 20px | var(--text-xl) |
| src/application-status.css:48 | (new) | var(--text-xl) |
| src/manager/manager.css:52 | 14px | var(--text-lg) |
| src/manager/manager.css:91 | (new) | var(--text-xl) |
| src/manager/manager.css:105 | 15px | var(--text-lg) |
| src/manager/manager.css:184 | 14px | var(--text-sm) |
| src/manager/manager.css:204 | 14px | var(--text-sm) |
| src/Chat.tsx:85 | 12 | var(--text-sm) |

</details>

## Доказательства

После правок node scripts/check-type.mjs возвращает exit 1:

```text
CSS files: 8; font sizes: 827
[гистограмма в полном актуальном прогоне ниже]
SUMMARY sizes<12=0; contrast<4.5=73; violations=73; unresolved=35; fixed-height-risks=131
```

393 размера ниже порога устранены, 73 исходных контрастных пары сохранены для G5. Необходимый exit 0 пока не достигнут.

<details>
<summary>Полный актуальный прогон: гистограмма, контраст и кандидаты на проверку высоты</summary>

```text
CSS files: 8; font sizes: 827
Font size histogram (clamp = minimum, rem at 16px root):
12px: 134
13px: 256
15px: 243
18px: 62
24px: 71
32px: 53
48px: 8
CONTRAST src/styles.css:16 :root #171923 / #f6f7f9 = 16.329:1 PASS
CONTRAST src/styles.css:113 input, select, textarea #171923 / #fff = 17.504:1 PASS
CONTRAST src/styles.css:182 .button #fff / #ef3124 = 4.090:1 FAIL
CONTRAST src/styles.css:196 .button.secondary #242835 / #fff = 14.686:1 PASS
CONTRAST src/styles.css:292 .badge #717989 / #f1f3f6 = 3.937:1 FAIL
CONTRAST src/styles.css:299 .badge.red #d9352a / #fff0ef = 4.220:1 FAIL
CONTRAST src/styles.css:303 .badge.green #148760 / #eaf7f0 = 4.087:1 FAIL
CONTRAST src/styles.css:322 .icon-tile #687184 / #f3f5f8 = 4.488:1 FAIL
CONTRAST src/styles.css:327 .icon-tile.red #ef3124 / #fff0ee = 3.691:1 FAIL
CONTRAST src/styles.css:331 .icon-tile.green #12865f / #e8f5ef = 4.073:1 FAIL
CONTRAST src/styles.css:410 .alert #966533 / #fff6ed = 4.674:1 PASS
CONTRAST src/styles.css:418 .alert.error #c8352a / #fff0ef = 4.742:1 PASS
CONTRAST src/styles.css:898 .step-number #ef3124 / #fff = 4.090:1 FAIL
CONTRAST src/styles.css:1112 .answer-icon #8b92a1 / #f4f5f8 = 2.865:1 FAIL
CONTRAST src/styles.css:1121 .answer.selected .answer-icon #ef3124 / #ffe9e5 = 3.513:1 FAIL
CONTRAST src/styles.css:1313 .demo-ribbon #9a7b76 / #fff8f5 = 3.657:1 FAIL
CONTRAST src/styles.css:1549 .empty-wallet #ef3124 / #fff = 4.090:1 FAIL
CONTRAST src/styles.css:1556 .empty-check #fff / #148d67 = 4.170:1 FAIL
CONTRAST src/styles.css:1785 .segmented > button.active #3a4356 / #fff = 9.919:1 PASS
CONTRAST src/styles.css:1860 .agent-avatar #fff / #ef3124 = 4.090:1 FAIL
CONTRAST src/styles.css:1968 .starter-prompts > button #828b9b / #fff = 3.434:1 FAIL
CONTRAST src/styles.css:1991 .message-agent #ef3124 / #fff0ed = 3.688:1 FAIL
CONTRAST src/styles.css:2087 .finance-chat-cta #cc5b4e / #fff7f4 = 3.839:1 FAIL
CONTRAST src/styles.css:2126 .send-button #fff / #ef3124 = 4.090:1 FAIL
CONTRAST src/styles.css:2312 .profile-table dt #9aa2b1 / #fafbfd = 2.480:1 FAIL
CONTRAST src/styles.css:2369 .doc-icon #20a56e / #eaf6ee = 2.836:1 FAIL
CONTRAST src/styles.css:2374 .color-1, .color-2 #377fe8 / #edf3ff = 3.517:1 FAIL
CONTRAST src/styles.css:2378 .color-3 #e9992d / #fff5e8 = 2.150:1 FAIL
CONTRAST src/styles.css:2382 .color-4 #956bea / #f1ecff = 3.265:1 FAIL
CONTRAST src/styles.css:2386 .color-5 #d65b8c / #fff0f4 = 3.317:1 FAIL
CONTRAST src/styles.css:2423 .file-name #959fb2 / #fafbfd = 2.574:1 FAIL
CONTRAST src/styles.css:2588 .circle-inner #ef3124 / #fff = 4.090:1 FAIL
CONTRAST src/styles.css:2606 .float-label #8f817c / #fff = 3.751:1 FAIL
CONTRAST src/styles.css:2687 .wizard-progress > span.active b #ef3124 / #fff1eb = 3.707:1 FAIL
CONTRAST src/styles.css:2828 .result-symbol #149268 / #edf7f1 = 3.590:1 FAIL
CONTRAST src/styles.css:2876 .formula #63748a / #f7f9fc = 4.530:1 PASS
CONTRAST src/styles.css:2918 th #95a0b2 / #f5f7fa = 2.462:1 FAIL
CONTRAST src/styles.css:3035 .success-state #31946b / #eff8f3 = 3.476:1 FAIL
CONTRAST src/styles.css:3172 .toast #fff / #263144 = 13.082:1 PASS
CONTRAST src/styles.css:3223 .tour-icon #ef3124 / #fff1ec = 3.709:1 FAIL
CONTRAST src/redesign.css:128 .app-shell .workspace-footer #687385 / #fff = 4.795:1 PASS
CONTRAST src/redesign.css:480 .schedule-empty #687385 / #fafbfc = 4.628:1 PASS
CONTRAST src/redesign.css:533 .forecast-conclusion #25614d / #f1f7f4 = 6.683:1 PASS
CONTRAST src/redesign.css:537 .forecast-conclusion.warning #90602a / #fff5e9 = 5.007:1 PASS
CONTRAST src/redesign.css:1288 .result-verdict #805422 / #fff7eb = 6.156:1 PASS
CONTRAST src/redesign.css:1292 .positive .result-verdict #1a614a / #edf7f2 = 6.726:1 PASS
CONTRAST src/redesign.css:1296 .unknown .result-verdict #4b5b70 / #f1f4f8 = 6.283:1 PASS
CONTRAST src/motion.css:279 .finance-controls button.active #d93126 / #fff3ef = 4.373:1 FAIL
CONTRAST src/motion.css:432 .journey-check #12865f / #e8f5ee = 4.070:1 FAIL
CONTRAST src/motion.css:744 .preparation-stages > span #ef3124 / #e3e6eb = 3.269:1 FAIL
CONTRAST src/chat.css:59 .chat-funding-context #8a97a9 / #fafbfd = 2.865:1 FAIL
CONTRAST src/chat.css:95 .chat-shell.chat-v3 .icon-button:hover #272e3a / #eef0f4 = 11.966:1 PASS
CONTRAST src/chat.css:212 .chat-shell.chat-v3 .history-search-row #89909d / #fff = 3.211:1 FAIL
CONTRAST src/chat.css:373 .chat-shell.chat-v3 .welcome-orb #ef3124 / #fff4f1 = 3.790:1 FAIL
CONTRAST src/chat.css:412 .chat-shell.chat-v3 .starter-prompts > button, .chat-shell.chat-v3 .context-prompts > button #737c8b / #fff = 4.213:1 FAIL
CONTRAST src/chat.css:455 .chat-shell.chat-v3 .message-agent #ed5d4f / #fff4f0 = 3.097:1 FAIL
CONTRAST src/chat.css:486 .chat-shell.chat-v3 .message.user .message-body #434b59 / #f2f3f6 = 7.921:1 PASS
CONTRAST src/chat.css:506 .chat-shell.chat-v3 .message-body > .badge #979eab / #f4f5f7 = 2.470:1 FAIL
CONTRAST src/chat.css:615 .chat-shell.chat-v3 .chat-finance-warning, .chat-shell.chat-v3 .proposal #8b7659 / #fffbf5 = 4.214:1 FAIL
CONTRAST src/chat.css:631 .chat-shell.chat-v3 .proposal #627084 / #f8fafc = 4.813:1 PASS
CONTRAST src/chat.css:739 .chat-shell.chat-v3 .composer .send-button #fff / #ef3124 = 4.090:1 FAIL
CONTRAST src/chat.css:752 .chat-shell.chat-v3 .send-button:disabled #a7aeb9 / #e6e9ef = 1.837:1 FAIL
CONTRAST src/chat.css:806 .chat-shell.chat-v3 .composer-file #8d97a7 / #fafbfc = 2.848:1 FAIL
CONTRAST src/chat.css:947 .chat-shell .feedback-icon:hover:not(:disabled) #4b5260 / #f1f3f6 = 7.062:1 PASS
CONTRAST src/chat.css:948 .chat-shell .feedback-icon[aria-pressed="true"] #0b0b0c / #eef0f3 = 17.232:1 PASS
CONTRAST src/chat.css:961 .chat-shell .feedback-reason:has(input:checked) #0b0b0c / #f6f7f9 = 18.354:1 PASS
CONTRAST src/cabinet.css:150 .cv-chip #8b94a2 / #f5f6f8 = 2.833:1 FAIL
CONTRAST src/cabinet.css:436 .cv-chart-empty #a4adba / #fafbfd = 2.189:1 FAIL
CONTRAST src/cabinet.css:561 .cv-discuss #6d7a8d / #f8fafc = 4.165:1 FAIL
CONTRAST src/cabinet.css:676 .cv-training-label #a78672 / #faf5f0 = 3.079:1 FAIL
CONTRAST src/cabinet.css:772 .cv-calendar-head button #7e8da2 / #f6f8fb = 3.174:1 FAIL
CONTRAST src/cabinet.css:792 .cv-calendar-grid button #8590a1 / #fafbfd = 3.120:1 FAIL
CONTRAST src/cabinet.css:796 .cv-calendar-grid button.has-payment #c57f70 / #fff3ee = 2.906:1 FAIL
CONTRAST src/cabinet.css:801 .cv-calendar-grid button.selected #586a82 / #edf0f5 = 4.839:1 PASS
CONTRAST src/cabinet.css:875 .nc-count white / #e27266 = 3.074:1 FAIL
CONTRAST src/cabinet.css:894 .nc-panel #5a687c / white = 5.667:1 PASS
CONTRAST src/cabinet.css:952 .nc-icon #a3afc0 / #f0f3f7 = 1.997:1 FAIL
CONTRAST src/cabinet.css:956 .nc-icon.risk #c0a07c / #faf3eb = 2.229:1 FAIL
CONTRAST src/cabinet.css:1246 .cv-calendar-launch #576b88 / #f5f7fb = 5.067:1 PASS
CONTRAST src/cabinet.css:1258 .cv-calendar-launch:hover:not(:disabled), .cv-calendar-launch[aria-expanded="true"] #ed392d / #fff0ee = 3.628:1 FAIL
CONTRAST src/cabinet.css:1307 .anchored-calendar .cv-calendar-head > button #506581 / #fff = 5.967:1 PASS
CONTRAST src/cabinet.css:1311 .anchored-calendar .cv-calendar-head > button:hover:not(:disabled) #e63a2e / #fff0ee = 3.783:1 FAIL
CONTRAST src/cabinet.css:1331 .anchored-calendar .cv-calendar-grid > button #485b75 / #fff = 6.933:1 PASS
CONTRAST src/cabinet.css:1339 .anchored-calendar .cv-calendar-grid > button.has-payment #c83226 / #fff0ed = 4.807:1 PASS
CONTRAST src/cabinet.css:1345 .anchored-calendar .cv-calendar-grid > button.selected #fff / #f03529 = 4.003:1 FAIL
CONTRAST src/cabinet.css:1370 .calendar-discuss #435674 / #fff = 7.442:1 PASS
CONTRAST src/cabinet.css:1397 .anchored-calendar .calendar-picker-trigger, .date-input-popup .calendar-picker-trigger #364b69 / #f7f9fc = 8.411:1 PASS
CONTRAST src/cabinet.css:1432 .calendar-picker-menu button #3b506d / #fff = 8.222:1 PASS
CONTRAST src/cabinet.css:1437 .calendar-picker-menu button[aria-selected="true"] #d1392c / #fff0ed = 4.371:1 FAIL
CONTRAST src/cabinet.css:1473 .date-input-trigger:hover, .date-input-trigger[aria-expanded="true"] #df362b / #fff0ed = 4.029:1 FAIL
CONTRAST src/cabinet.css:1487 .date-input-popup #23334d / #fff = 12.711:1 PASS
CONTRAST src/cabinet.css:1513 .date-input-popup > header button, .date-input-navigation > button #627895 / #fff = 4.526:1 PASS
CONTRAST src/cabinet.css:1518 .date-input-popup button:hover:not(:disabled) #d5362a / #fff0ed = 4.314:1 FAIL
CONTRAST src/cabinet.css:1561 .date-input-grid > button #465b77 / #f7f9fc = 6.586:1 PASS
CONTRAST src/cabinet.css:1573 .date-input-grid > button[aria-pressed="true"] white / #f03529 = 4.003:1 FAIL
CONTRAST src/cabinet.css:1816 .context-help-trigger:hover, .context-help-trigger[aria-expanded="true"] #e6342a / #f0f3f8 = 3.862:1 FAIL
CONTRAST src/cabinet.css:1839 .context-help-panel, .anchored-calendar #243047 / #fff = 13.218:1 PASS
CONTRAST src/cabinet.css:1901 .anchored-calendar > header button #63718a / #f3f5f8 = 4.514:1 PASS
CONTRAST src/cabinet.css:1912 .cv-month-selectors select #37445a / #f5f7fa = 9.157:1 PASS
CONTRAST src/financing.css:121 .funding-stages .active b #ed3a2c / #fff0ed = 3.613:1 FAIL
CONTRAST src/financing.css:160 .funding-purpose-icon #f1392e / #fff0ed = 3.530:1 FAIL
CONTRAST src/financing.css:227 .funding-choices button #5c6e88 / #f8f9fc = 4.936:1 PASS
CONTRAST src/financing.css:230 .funding-choices button[aria-pressed="true"] #d93227 / #fff0ed = 4.269:1 FAIL
CONTRAST src/financing.css:337 .funding-net-flow #657792 / #f7f9fc = 4.322:1 FAIL
CONTRAST src/financing.css:383 .funding-error #b83428 / #fff2ef = 5.393:1 PASS
CONTRAST src/financing.css:500 .funding-verdict #677b96 / #f8f9fc = 4.113:1 FAIL
CONTRAST src/financing.css:504 .positive .funding-verdict #3d8663 / #f1f9f5 = 4.095:1 FAIL
CONTRAST src/financing.css:508 .caution .funding-verdict #b48048 / #fff6ef = 3.215:1 FAIL
CONTRAST src/financing.css:664 .funding-catalog-warning #bc6d40 / #fff9f2 = 3.720:1 FAIL
CONTRAST src/financing.css:699 .funding-old-version #96723c / #fff6e8 = 4.110:1 FAIL
CONTRAST src/financing.css:730 .funding-success #3a8060 / #f1f9f5 = 4.420:1 FAIL
CONTRAST src/manager/manager.css:201 .manager-tabs .button[aria-pressed="true"] #fff / #171923 = 17.504:1 PASS
UNRESOLVED src/styles.css:212 .text-button: contrast needs backdrop/computed style: inherit / none
UNRESOLVED src/styles.css:236 .icon-button: contrast needs backdrop/computed style: #555e70 / transparent
UNRESOLVED src/styles.css:1227 .demo-switch > button: contrast needs backdrop/computed style: #88685d / #ffffff90
UNRESOLVED src/styles.css:1271 .app-header nav button: contrast needs backdrop/computed style: #858b98 / none
UNRESOLVED src/styles.css:1779 .segmented > button: contrast needs backdrop/computed style: #929aaa / none
UNRESOLVED src/styles.css:1929 .welcome-orb: contrast needs backdrop/computed style: #ef3124 / radial-gradient(circle at 30% 25%, #ffebe7, #fff8f5)
UNRESOLVED src/styles.css:2459 .fixture-link: contrast needs backdrop/computed style: #9aa4b4 / none
UNRESOLVED src/styles.css:2514 .page-tabs > button: contrast needs backdrop/computed style: #959eae / none
UNRESOLVED src/styles.css:3184 .toast > button: contrast needs backdrop/computed style: #fff / none
UNRESOLVED src/redesign.css:794 .composer .finance-chat-cta: contrast needs backdrop/computed style: #525e70 / transparent
UNRESOLVED src/redesign.css:1055 .password-input > button: contrast needs backdrop/computed style: #687385 / transparent
UNRESOLVED src/motion.css:56 .orbit-satellite: contrast needs backdrop/computed style: #a08b82 / #ffffffd9
UNRESOLVED src/motion.css:80 .finance-core: contrast needs backdrop/computed style: #fff / linear-gradient(145deg, #ff9781 -15%, #ff4435 35%, #e4201b 80%)
UNRESOLVED src/motion.css:271 .finance-controls button: contrast needs backdrop/computed style: #8d929f / transparent
UNRESOLVED src/motion.css:407 .journey-illustration: contrast needs backdrop/computed style: #ef3124 / radial-gradient(ellipse at 30% 50%, #ffe7df, transparent 70%)
UNRESOLVED src/motion.css:717 .preparation-copy h1: contrast needs backdrop/computed style: #292630 / linear-gradient(105deg, #292630 15%, #d85842 42%, #292630 67%)
UNRESOLVED src/chat.css:88 .chat-shell.chat-v3 .icon-button: contrast needs backdrop/computed style: #828997 / transparent
UNRESOLVED src/chat.css:195 .chat-shell.chat-v3 .history-new: contrast needs backdrop/computed style: #535c6b / transparent
UNRESOLVED src/chat.css:278 .chat-shell.chat-v3 .history-select: contrast needs backdrop/computed style: #596272 / transparent
UNRESOLVED src/chat.css:468 .chat-shell.chat-v3 .message-body: contrast needs backdrop/computed style: #3e4756 / transparent
UNRESOLVED src/chat.css:646 .chat-shell.chat-v3 .thinking: contrast needs backdrop/computed style: #9da4b0 / transparent
UNRESOLVED src/chat.css:719 .chat-shell.chat-v3 .composer-row textarea: contrast needs backdrop/computed style: #3d485b / transparent
UNRESOLVED src/chat.css:775 .chat-shell.chat-v3 .composer .finance-chat-cta: contrast needs backdrop/computed style: #8b95a5 / transparent
UNRESOLVED src/chat.css:816 .chat-shell.chat-v3 .composer-file > button:not(.icon-button), .chat-shell.chat-v3 .composer-file > span: contrast needs backdrop/computed style: #687486 / transparent
UNRESOLVED src/chat.css:945 .chat-shell .feedback-icon: contrast needs backdrop/computed style: #9aa1ad / transparent
UNRESOLVED src/cabinet.css:297 .cv-calendar-button: contrast needs backdrop/computed style: #78869a / none
UNRESOLVED src/cabinet.css:458 .cv-icon: contrast needs backdrop/computed style: #9da6b3 / none
UNRESOLVED src/cabinet.css:586 .cv-metric button: contrast needs backdrop/computed style: #acb3bd / none
UNRESOLVED src/cabinet.css:752 .cv-plan-row button: contrast needs backdrop/computed style: #a5aebc / none
UNRESOLVED src/cabinet.css:928 .nc-toolbar button: contrast needs backdrop/computed style: #8495ab / none
UNRESOLVED src/cabinet.css:992 .nc-actions button: contrast needs backdrop/computed style: #8595aa / none
UNRESOLVED src/cabinet.css:1467 .date-input-trigger: contrast needs backdrop/computed style: #61728b / transparent
UNRESOLVED src/cabinet.css:1591 .date-input-popup > footer button: contrast needs backdrop/computed style: #d5362a / transparent
UNRESOLVED src/cabinet.css:1810 .context-help-trigger, .cv-metric .context-help-trigger: contrast needs backdrop/computed style: #78869c / none
UNRESOLVED src/financing.css:688 .funding-versions > button: contrast needs backdrop/computed style: #75859b / transparent
LAYOUT src/styles.css:228 .icon-button: fixed height 35px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:262 .brand-symbol: fixed height 38px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:269 .brand-symbol > span: fixed height 3px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:320 .icon-tile: fixed height 43px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:336 .tiny-red: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:344 .pulse-dot, .status-dot: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:353 .offline-dot, .neutral-dot: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:430 .spinner: fixed height 24px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:540 .visual-orbit:before: fixed height 300px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:593 .chart-arrow: fixed height 38px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:628 .legend: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:797 .mini-bars: fixed height 120px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:826 .feature-big-icon: fixed height 42px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:837 .payment-ring: fixed height 80px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1050 .onboard-progress > div: fixed height 3px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1110 .answer-icon: fixed height 38px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1140 .radio: fixed height 16px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1160 .compact .answer-icon: fixed height 25px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1376 .intro-note .icon-tile: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1385 .splitter: fixed height 450px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1395 .splitter > span: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1405 .splitter > input: fixed height 120px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1448 .notification-dot: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1508 .notice .icon-tile: fixed height 30px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1524 .empty-illustration: fixed height 130px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1532 .empty-orbit: fixed height 115px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1541 .empty-wallet: fixed height 78px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1559 .empty-check: fixed height 27px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1611 .demo-load .icon-tile: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1668 .progress-track: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1734 .payment-breakdown: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1745 .payment-legend i: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1857 .agent-avatar: fixed height 33px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1892 .chat-header .icon-button: fixed height 29px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1923 .welcome-orb: fixed height 50px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:1989 .message-agent: fixed height 25px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2052 .thinking i: fixed height 4px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2103 .composer-row > .icon-button: fixed height 30px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2122 .send-button: fixed height 33px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2343 .onboard-facts .icon-tile: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2365 .doc-icon: fixed height 39px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2561 .finance-circle: fixed height 210px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2583 .circle-inner: fixed height 95px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2725 .purpose .icon-tile: fixed height 38px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:2821 .result-symbol: fixed height 78px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3219 .tour-icon: fixed height 55px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3243 .tour-dots i: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3369 .chat-header .icon-button: fixed height 26px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3373 .agent-avatar: fixed height 29px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3696 .visual-orbit:before: fixed height 240px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3727 .visual-chip .icon-tile: fixed height 30px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3759 .benefit-strip svg: fixed height 21px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3810 .mini-bars: fixed height 90px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3948 .app-header .brand-symbol: fixed height 31px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3955 .app-header .brand-symbol > span: fixed height 2px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:3962 .header-tools .icon-button: fixed height 29px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:4029 .empty-illustration: fixed height 115px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:4089 .agent-avatar: fixed height 31px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:4094 .chat-header .icon-button: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/styles.css:4363 .result-symbol: fixed height 48px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:55 .visually-hidden: fixed height 1px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:220 .splitter > span: fixed height 52px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:423 .credit-summary .progress-track: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:592 .chat-header .icon-button: fixed height 32px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:670 .chat-welcome .welcome-orb: fixed height 40px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:734 .message-agent: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:822 .composer .send-button: fixed height 38px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:833 .composer-row .icon-button: fixed height 38px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:928 .onboard-progress > div: fixed height 4px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1049 .password-input > button: fixed height 40px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1136 .range-field input[type="range"]: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1151 .range-field input[type="range"]::-webkit-slider-thumb: fixed height 21px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1161 .range-field input[type="range"]::-moz-range-thumb: fixed height 16px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1233 .capacity-track: fixed height 8px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1770 .chat-header .icon-button: fixed height 32px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/redesign.css:1807 .message-agent: fixed height 23px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:55 .orbit-satellite: fixed height 43px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:75 .finance-core: fixed height 112px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:102 .finance-core > i: fixed height 7px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:119 .finance-signal > span: fixed height 4px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:144 .motion-status-dot: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:196 .finance-sparkline: fixed height 115px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:248 .finance-insight .icon-tile: fixed height 36px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:402 .journey-illustration: fixed height 100px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:419 .journey-mini-line: fixed height 7px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:435 .journey-check: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:442 .journey-doc: fixed height 59px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:457 .journey-doc::after: fixed height 4px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:470 .journey-bar: fixed height 25px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:480 .journey-bar.second: fixed height 42px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:485 .journey-bar.third: fixed height 60px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:580 .preparation-orbit: fixed height 355px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:607 .preparation-orbit i::after: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:615 .preparation-sphere: fixed height 240px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:642 .sphere-liquid i: fixed height 45px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:668 .sphere-shine::before: fixed height 23px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:739 .preparation-stages > span: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:818 .finance-core: fixed height 92px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:869 .preparation-orbit: fixed height 295px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/motion.css:874 .preparation-sphere: fixed height 205px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:82 .chat-shell.chat-v3 .icon-button: fixed height 32px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:234 .chat-shell.chat-v3 .history-search-row .icon-button: fixed height 23px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:368 .chat-shell.chat-v3 .welcome-orb: fixed height 45px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:449 .chat-shell.chat-v3 .message-agent: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:651 .chat-shell.chat-v3 .thinking > .chat-spinner: fixed height 13px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:698 .chat-shell.chat-v3 .composer-row > .icon-button: fixed height 36px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:733 .chat-shell.chat-v3 .composer .send-button: fixed height 36px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:835 .chat-shell.chat-v3 .composer-file .icon-button: fixed height 20px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:877 .chat-shell.chat-v3 .message-agent: fixed height 24px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/chat.css:944 .chat-shell .feedback-icon: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:203 .cv-progress > div: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:324 .cv-chart-key i: fixed height 2px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:336 .cv-chart-plot: fixed height 200px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:460 .cv-icon: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:635 .cv-recommendations article > i: fixed height 6px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:807 .cv-calendar-grid button i: fixed height 3px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:948 .nc-icon: fixed height 32px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1243 .cv-calendar-launch: fixed height 40px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1303 .anchored-calendar .cv-calendar-head > button: fixed height 36px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1354 .anchored-calendar .cv-calendar-grid > button i: fixed height 4px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1509 .date-input-popup > header button, .date-input-navigation > button: fixed height 34px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1641 .unified-cabinet .cv-chart-plot: fixed height 155px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1745 .metric-scale-track: fixed height 7px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1765 .metric-scale-track i: fixed height 13px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1804 .context-help-trigger, .cv-metric .context-help-trigger: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/cabinet.css:1898 .anchored-calendar > header button: fixed height 28px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/financing.css:78 .funding-progress: fixed height 4px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/financing.css:158 .funding-purpose-icon: fixed height 42px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/financing.css:186 .funding-choice-check: fixed height 16px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/financing.css:456 .funding-result .capacity-track: fixed height 5px; inspect text/clipping at 390/768/1280 and 200%
LAYOUT src/manager/manager.css:190 .manager-return input: fixed height 18px; inspect text/clipping at 390/768/1280 and 200%
SUMMARY sizes<12=0; contrast<4.5=73; violations=73; unresolved=35; fixed-height-risks=131
Static source audit only: cascading overrides, inherited backgrounds, gradients, zoom and spacing require browser review.
```

</details>

```text
npx.cmd --no-install tsc --noEmit
exit 0, вывода нет

node scripts/check-icons.mjs
Иконки: 38/38; ошибок: 0

npm.cmd test
SystemError [ERR_SYSTEM_ERROR]: uv_os_get_passwd returned ENOMEM (not enough memory)
exit 1, то же ограничение, что до правок

node --import ./tests/qa/q3-loader.ts --test tests/*.test.ts tests/*.test.tsx
tests 901; pass 899; fail 2
restart: ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX, TypeScript parameter property is not supported in strip-only mode
Занятый порт: дочерний tsx падает на uv_os_get_passwd ENOMEM

node --import ./tests/qa/q3-loader.ts --test tests/qa/g4-type.test.ts
tests 7; pass 6; fail 1
G4 source typography and contrast audit exits successfully:
SUMMARY sizes<12=0; contrast<4.5=73; violations=73; unresolved=35; fixed-height-risks=131

node --import ./tests/qa/q3-loader.ts --test --test-name-pattern='G4 (rate formatter|auditor reads|all stylesheet|text controls|calculation displays|server offer)' tests/qa/g4-type.test.ts
tests 6; pass 6; fail 0

git diff --check
exit 0, ошибок пробелов нет
```

Полный QA-прогон после продуктовых правок и первых шести тестов G4:

```text
node --import ./tests/qa/q3-loader.ts --test tests/qa/*.test.ts tests/qa/*.test.tsx
tests 171; pass 169; fail 2
F3 offer renders only actual server terms, not requested amount as offer:
AssertionError: expected /24%/, actual <b>24 % годовых</b>
G4 source typography and contrast audit exits successfully:
SUMMARY sizes<12=0; contrast<4.5=73; violations=73; unresolved=35; fixed-height-risks=131
```

После этого добавлен седьмой тест, который проверяет реальный оффер с 0.215 и отсутствие выдуманной ставки. Он отдельно прошёл вместе с пятью остальными независимыми тестами G4. Полный QA после добавления только этого теста не повторялся. Ни одного другого сбоя QA относительно 165/165 до правок не найдено; одна старая проверка F3 требует обновления под новый формат, одна новая проверка G4 ждёт G5.

Изменённые файлы: REPORT.md; scripts/check-type.mjs; tests/qa/g4-type.test.ts; src/format-rate.ts; src/styles.css; src/redesign.css; src/motion.css; src/chat.css; src/cabinet.css; src/financing.css; src/application-status.css; src/manager/manager.css; src/ui.tsx; src/Cabinet.tsx; src/CabinetV2.tsx; src/SelectionResult.tsx; src/ApplicationStatus.tsx; src/manager/ManagerWorkspace.tsx; src/Chat.tsx.

Ограничения резервного запуска основных тестов воспроизведены отдельно: tests/applications-contract.test.ts:772 импортирует applications.ts?restart=..., который не обрабатывается существующим q3-loader.ts и попадает в strip-only Node. Файл tests/server-start.test.ts:6 запускает дочерний tsx с тем же ограничением среды. Это не проверка, что npm test зелёный; штатный npm test не прогнан в песочнице. Исправления тестового загрузчика и стартовых тестов вне G4 не делались.

Факты из стандарта проверены по первоисточнику W3C 24.10.2026. WCAG не задаёт минимальный размер текста 12/13/15 px: это критерии проекта. Для краткости содержание стандарта пересказано.

| Утверждение | URL | Дата обращения |
|---|---|---|
| WCAG 2.2, 1.4.3: обычный текст требует 4,5:1, крупный текст 3:1 с исключениями стандарта. Скрипт проекта использует более строгий общий порог 4,5:1 для найденных пар и не определяет, является ли иконка текстом. | https://www.w3.org/TR/WCAG22/#contrast-minimum | 24.10.2026 |
| WCAG 2.2, 1.4.4: увеличение текста до 200% должно сохранять содержание и функциональность, кроме оговорённых стандартом случаев. | https://www.w3.org/TR/WCAG22/#resize-text | 24.10.2026 |
| WCAG 2.2, 1.4.12: пользовательские интервалы, в том числе line-height 1,5 и межбуквенный интервал 0,12em, не должны приводить к потере содержания или функций. | https://www.w3.org/TR/WCAG22/#text-spacing | 24.10.2026 |

## Не сделано и почему

Контраст не исправлен: TASK.md прямо запрещает менять цвета и темы, это G5. Нельзя одновременно получить exit 0 строгого измерителя и сохранить исходные цвета. Вопрос о критерии приёмки задан капитану; до ответа порог не ослабляется.

Тест F3 требует старый формат 24%, который противоречит требуемому G4 формату 24 %. Изменять tests/qa/f3-screens.test.ts не разрешено списком файлов, поэтому тест оставлен как есть. Условия банка и числовое значение ставки сохраняются, изменён только пробел.

Экран в браузере не открывался по условиям задания; на стенд ничего не выкатывалось. Зависимости не устанавливались. Новые логи в приложении не требовались: воспроизведение сделано постоянным регрессионным тестом и исходным прогоном измерителя.

## Нужно от других

G5: исправить 73 контрастных пары, полный список файл:строка и коэффициент в актуальном прогоне ниже. Пример src/styles.css, .button: #fff на #ef3124 = 4,090:1. Часть кандидатов является иконками или имеет более поздние переопределения: перед коррекцией владелец G5 должен сверить действующий DOM, а не считать список доказательством 73 нарушений WCAG.

tests/qa/f3-screens.test.ts:112: ожидать 24 с пробелом перед %, с согласованной корректировкой отрицательных проверок того же формата в этом файле. Нужен владелец F3 либо явное расширение списка файлов G4. Удаление пробела ради старого теста нарушит новую задачу.

## Не проверено

Фактическая вёрстка при 390, 768, 1280 px, масштаб 200%, пользовательские интервалы, табличные цифры выбранного системного шрифта и длина строки в пикселях. Статический разбор не вычисляет каскад, не доказывает совпадение селектора с текстом и не находит пары, чьи фон и цвет наследуются от разных элементов. Прозрачные фоны, градиенты, неоднозначные локальные токены и контраст без явно заданного фона остаются для браузера; в отчёте измерителя 35 таких неразрешённых кандидатов. Неизмеримые пары не объявлены прошедшими.

131 фиксированная высота в текущем исходнике остаётся списком кандидатов на осмотр, а не 131 доказанной поломкой. Среди них декоративные полоски, SVG, кнопки с иконками, графики, ползунок и visually-hidden. У критичных текстовых контейнеров тест проверяет отсутствие height в px; размеры оболочек в процентах и высота, которую ChatComposer вычисляет через scrollHeight, требуют реального браузера.

Штатный npm test вне песочницы и визуальная проверка после интеграции G5 не выполнены.

## Что проверить Клоду в браузере

1. Открой кабинет клиента на ширине 1280 px, затем 768 и 390. Проверь шапку, подвал, открытое мобильное меню и переходы между разделами: текст не обрезается, рабочая область скроллится.
2. Открой заполненный кредитный кабинет, затем подбор с крупной суммой и платёж. Убедись, что длинные суммы переносятся внутри колонки, таблица имеет свой скролл, ключевые суммы крупнее подписей, ставка имеет запятую и пробел перед %.
3. Открой предложенную банком заявку со ставкой 0.215 в серверном payload. Увидишь 21,5 % годовых. Проверь варианты со ставкой в процентных пунктах: значение также не умножается повторно.
4. Открой менеджера, очередь, красное досье и записку. На 390/768/1280 проверь крупный лимит, суммы в очереди, длинные объяснения и кнопки формы. Сравни выравнивание цифр в строках.
5. Открой чат, его историю, переименование и многострочное поле ввода; календарь дат и уведомления. Увеличь масштаб до 200%, затем примени интервалы из WCAG 1.4.12. Проверь доступность всех контролов и отсутствие потери текста.
6. После G5 измерь вычисленные цвета основного и вторичного текста на реальных фонах, включая кнопки, предупреждения, подписи, таблицы, подсказки и модальные окна. Повтори check-type.mjs и весь QA-прогон после обновления ожидания F3.
