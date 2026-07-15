Ты делаешь актуальный immigration research по стране: {{COUNTRY}}.

Дата исследования: {{TODAY}}. Нужна максимально свежая информация. Используй web search и проверяй первичные или официальные источники, когда это возможно: сайты миграционных служб, консульств, налоговых органов, официальные правительственные порталы, законы, международные паспортные индексы. Если используешь неофициальный источник, пометь это в notes и снизь confidence.

Контекст заявителя:
- Профессия: программист / software engineer.
- Есть профильный диплом.
- Есть действующий контракт с зарубежным клиентом или работодателем вне исследуемой страны.
- Цель: найти страны, где возможна самостоятельная подача без местного работодателя.
- Профиль должен считаться обычным foreign-contract remote work: заявитель работает удаленно на зарубежного клиента/работодателя. НЕ считать подходящими маршруты, которые требуют elite talent, founder/startup route, investor/golden visa, venture funding, local company hiring, prospective local employment, exceptional achievements или значимые капиталовложения, если нет отдельного обычного remote-worker/freelance/self-employed варианта.
- Важно: программы, где требуется job offer, work permit sponsorship, labor market test или виза от местного работодателя, НЕ считаются валидными для выборки, даже если подходят программистам.

Что надо выяснить:
1. Есть ли независимый путь самостоятельной подачи:
   - Digital Nomad Visa, remote worker visa, freelance/self-employed visa, independent visa, entrepreneur/sole proprietor route, residence permit for independent professionals.
   - Возможен ли сценарий: приехать как турист, открыть банковский счет, зарегистрировать индивидуального предпринимателя / sole proprietor / freelancer / self-employed status и затем легализовать пребывание.
   - Если страна имеет только employer-sponsored route, clearly mark valid_for_selection=false.
2. Может ли страна дать сразу ВНЖ или ПМЖ по наличию профильного образования, квалификации программиста, points-based migration, talent route или аналогичного механизма без местного работодателя.
3. Для каждого потенциально подходящего маршрута:
   - название программы;
   - тип статуса: visa, temporary residence, permanent residence, freelancer status, entrepreneur status, citizenship, other;
   - можно ли подаваться самому;
   - нужен ли местный работодатель;
   - нужен ли зарубежный контракт;
   - минимальный доход в USD в месяц;
   - минимальный доход в локальной валюте;
   - display-значение дохода для UI: если нет USD, укажи локальную валюту; если порог не опубликован, явно напиши это в income_requirement_display;
   - сколько месяцев дохода надо подтвердить;
   - другие ключевые требования: диплом, опыт, страховка, жилье, справка о несудимости, банковский баланс, бизнес-план, регистрация ИП, налоговый номер, местный адрес;
   - срок первичного статуса и продление.
4. Налоги:
   - налоговая резидентность: когда возникает;
   - ставка подоходного налога на такой доход, в процентах;
   - социальные взносы / фиксированные платежи / минимальные ежемесячные платежи;
   - отдельно проверь fixed payments для digital nomad / self-employed сценария: обязательная медстраховка, social security, minimum monthly contribution, flat/fixed freelancer tax, municipal/business registration fee, visa/residence card fees, renewal fees, stamp duties, VAT registration thresholds, financial transaction taxes;
   - есть ли специальные режимы для digital nomads, freelancers, expatriates, remittance basis, territorial tax, non-dom, tax holiday;
   - укажи caveats, потому что налог зависит от резидентности, структуры контракта и договора об избежании двойного налогообложения.
5. Переходы статуса:
   - можно ли с этой визы/статуса перейти на ВНЖ;
   - можно ли перейти на ПМЖ;
   - сколько лет до ВНЖ, потом до ПМЖ, потом до гражданства;
   - сколько обычно длится рассмотрение гражданства после подачи;
   - какие условия: язык, интеграция, физическое присутствие, отсутствие длительных выездов, доход, налоги, отказ от прежнего гражданства.
   - обязательно отделяй право временно жить по digital nomad / remote worker visa от реального пути к ПМЖ/гражданству. Если маршрут только временный и не ведет к settlement, явно пометь это как temporary_nomad_only.
6. Брак:
   - ускоряется ли гражданство или ПМЖ при браке с гражданином/гражданкой страны;
   - влияет ли уже существующий брак;
   - сколько лет брака/совместного проживания нужно;
   - нужны ли residence requirements, язык, интеграция;
   - предупреди о проверках genuine marriage и рисках фиктивного брака.
7. Гражданство ребенка по рождению:
   - действует ли jus soli, jus sanguinis или смешанная система;
   - получит ли ребенок гражданство, если оба родителя мигранты;
   - получит ли ребенок гражданство, если только отец мигрант, а второй родитель местный гражданин или постоянный резидент;
   - дает ли рождение ребенка гражданина преимущества отцу для ВНЖ/ПМЖ/гражданства.
8. Паспорт:
   - рейтинг паспорта в Henley Passport Index или другом указанном индексе;
   - количество направлений без визы;
   - количество направлений с визой заранее;
   - количество направлений с visa on arrival / eTA, если источник это разделяет.
   - для стран, которые проходят selection, rank и visa_free_destinations не должны оставаться пустыми: если Henley не дает отдельную разбивку, используй надежный паспортный индекс и укажи source.
9. Языки:
   - официальный национальный язык/языки;
   - насколько реально жить и работать удаленно на английском или русском/украинском, если источники это подтверждают.
10. Экономика:
   - средняя зарплата в стране в USD в месяц;
   - медианная зарплата, если доступна;
   - краткий комментарий по стоимости жизни только если есть надежный источник.

Критерии валидности для selection:
- valid_for_selection=true только если есть хотя бы один маршрут, где заявитель может податься самостоятельно без местного работодателя.
- Digital nomad route валиден, если разрешает жить в стране с зарубежным контрактом/доходом.
- Freelance/self-employed route валиден, если можно получить статус без местного работодателя.
- Employer-sponsored skilled worker routes невалидны для selection.
- Founder/startup, investor/golden visa, elite talent/high-achievement, ONE Pass/Tech.Pass-style, local employment or prospective local-employment routes невалидны для текущей selection, если они не подходят обычному foreign-contract remote worker без стартапа, инвестиций, выдающихся достижений или местной работы.
- Planned / announced / authorized-but-not-open programs невалидны для текущей selection: ставь valid_for_selection=false, если нет активного официального канала подачи или стабильных правил.
- Если информация противоречивая или не подтверждена актуальными источниками, поставь valid_for_selection="uncertain" и объясни почему.

Классификация пути к гражданству:
- Для каждой страны заполни settlement_track.classification одним из значений:
  - strong_citizenship_track: выбранный самостоятельный маршрут сам по себе является обычным/квалифицирующим residence route и реалистично может вести к ПМЖ/гражданству при соблюдении условий.
  - possible_with_conversion: страна подходит для въезда/проживания, но для гражданства обычно нужен переход на другой qualifying residence / PR status или есть существенная проверка, засчитывается ли этот статус.
  - weak_or_uncertain_citizenship_track: маршрут есть, но связь с ПМЖ/гражданством слабая, спорная, discretionary или требует отдельной legal verification.
  - temporary_nomad_only: маршрут временный, nomad/workcation/visitor-like, не должен ранжироваться как путь к гражданству.
  - not_valid_no_current_route_confirmed: не найден активный самостоятельный маршрут.
  - not_valid_employer_or_job_offer_required: подходит только через местного работодателя/job offer/sponsorship.
  - not_valid_pending_implementation: программа анонсирована или разрешена законом, но еще не открыта для подачи.
- Заполни settlement_track.can_lead_to_citizenship_from_this_route как boolean или "uncertain".
- Заполни settlement_track.requires_switch_to_another_status.
- Заполни citizenship_track_strength: strong, possible_with_conversion, weak_or_uncertain, none_or_separate_route_required или none.
- Добавь nomad_only_warning, если выбранный маршрут временный и не ведет напрямую к ПМЖ/гражданству.
- Добавь fully_matched=true только если valid_for_selection=true и settlement_track.classification равно strong_citizenship_track или possible_with_conversion. Во всех остальных случаях fully_matched=false.
- Добавь regular_foreign_contract_remote_work_fit.value=true/false/"needs_manual_review". fully_matched не может быть true, если regular_foreign_contract_remote_work_fit.value=false.

Требования к ответу:
- Отвечай только валидным JSON по заданной схеме.
- Все суммы в USD должны быть примерно конвертированы на дату исследования. Если курс взят приблизительно, укажи это в notes.
- Если официальный порог дохода опубликован только в локальной валюте, не оставляй поле пустым: укажи local currency amount и income_requirement_display. USD может быть приблизительным или null, если конверсия ненадежна.
- Не выдумывай точные числа. Если точного числа нет, используй null и объясни в notes.
- Для best_routes[0] обязательно заполни income_requirement_display.value, даже если minimum_monthly_income_usd.value=null.
- Для всех valid_for_selection=true стран обязательно заполни taxes.taxation_system: rate_type, top_personal_income_tax_rate_percent, tax_residency_rule, income_scope, special_regimes, social_security, confidence, source_ids, notes.
- Для всех valid_for_selection=true стран обязательно заполни taxes.digital_nomad_taxation:
  - route_tax_category;
  - top_or_screening_pit_rate_percent;
  - income_tax_display;
  - tax_residency_rule;
  - foreign_income_treatment;
  - special_digital_nomad_or_inbound_regime;
  - social_security_and_payroll;
  - fixed_payments.status;
  - fixed_payments.social_security_or_payroll;
  - fixed_payments.visa_or_state_fees;
  - fixed_payments.other_fixed_or_transaction_taxes;
  - fixed_payments.notes;
  - practical_scenarios.under_tax_residency_threshold;
  - practical_scenarios.tax_resident_remote_worker;
  - practical_scenarios.self_employed_or_local_registration.
  Если фиксированные платежи не найдены, не оставляй пустым: укажи not_confirmed_in_dataset и объясни, что нужно проверить официально.
- В каждом важном claim добавь source_ids, которые ссылаются на массив sources.
- Предпочитай краткость, но не теряй критерии, суммы и сроки.
