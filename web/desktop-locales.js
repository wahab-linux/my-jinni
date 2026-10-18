// Native-only interface messages extend, but never override, the shared catalog.
(() => {
  const native = {
  "Loading providers…": { "zh-CN": "正在加载服务商…", "fr": "Chargement des fournisseurs…", "ja": "プロバイダーを読み込み中…", "ru": "Загрузка сервисов…" },
  "Ask": { "zh-CN": "提问", "fr": "Demander", "ja": "質問する", "ru": "Спросить" },
  "Answer": { "zh-CN": "回答", "fr": "Réponse", "ja": "回答", "ru": "Ответ" },
  "Calculated result": { "zh-CN": "计算结果", "fr": "Résultat calculé", "ja": "計算結果", "ru": "Результат расчёта" },
  "Original context": { "zh-CN": "原文背景", "fr": "Contexte original", "ja": "元の文脈", "ru": "Исходный контекст" },
  "AI limitations": { "zh-CN": "AI 的局限", "fr": "Limites de l’IA", "ja": "AI の制限", "ru": "Ограничения ИИ" },
  "Kept in session memory only. Never saved or shared between providers.": { "zh-CN": "仅保留在会话内存中，不会保存或分享给其他服务商。", "fr": "En mémoire de session uniquement, jamais enregistrée ni partagée entre fournisseurs.", "ja": "セッションのメモリにのみ保持し、保存や他社との共有はしません。", "ru": "Только в памяти сеанса. Не сохраняется и не передаётся другим сервисам." },
  "AUTHORITATIVE CALCULATED COMPARISON": {
    "zh-CN": "以此计算比较结果为准",
    "fr": "COMPARAISON CALCULÉE DE RÉFÉRENCE",
    "ja": "正式な比較計算結果",
    "ru": "РАСЧЁТНОЕ СРАВНЕНИЕ"
  },
  "SOURCE-GROUNDED ANSWER": {
    "zh-CN": "有资料依据的回答",
    "fr": "RÉPONSE FONDÉE SUR LES SOURCES",
    "ja": "資料に基づく回答",
    "ru": "ОТВЕТ НА ОСНОВЕ ИСТОЧНИКОВ"
  },
  "Ask your sources": {
    "zh-CN": "向资料提问",
    "fr": "Interroger vos sources",
    "ja": "資料に質問する",
    "ru": "Спросить по источникам"
  },
  "Close": {
    "zh-CN": "关闭",
    "fr": "Fermer",
    "ja": "閉じる",
    "ru": "Закрыть"
  },
  "AI provider": {
    "zh-CN": "AI 服务商",
    "fr": "Fournisseur IA",
    "ja": "AI プロバイダー",
    "ru": "Сервис ИИ"
  },
  "Your question": {
    "zh-CN": "你的问题",
    "fr": "Votre question",
    "ja": "質問",
    "ru": "Ваш вопрос"
  },
  "Include my current comparison": {
    "zh-CN": "包含当前比较设置",
    "fr": "Inclure ma comparaison actuelle",
    "ja": "現在の比較を含める",
    "ru": "Включить текущее сравнение"
  },
  "Include my current activity preferences": {
    "zh-CN": "包含当前活动偏好",
    "fr": "Inclure mes préférences d’activité",
    "ja": "現在の活動の希望条件を含める",
    "ru": "Включить текущие предпочтения досуга"
  },
  "Model settings": {
    "zh-CN": "模型设置",
    "fr": "Réglages du modèle",
    "ja": "モデル設定",
    "ru": "Настройки модели"
  },
  "Provider model": {
    "zh-CN": "服务商模型",
    "fr": "Modèle du fournisseur",
    "ja": "プロバイダーのモデル",
    "ru": "Модель сервиса"
  },
  "Ask with selected context": {
    "zh-CN": "使用所选背景提问",
    "fr": "Interroger le contexte choisi",
    "ja": "選択した情報で質問",
    "ru": "Спросить с выбранным контекстом"
  },
  "AI session settings": {
    "zh-CN": "AI 会话设置",
    "fr": "Réglages de session IA",
    "ja": "AI セッション設定",
    "ru": "Настройки сеанса ИИ"
  },
  "Use for this session": {
    "zh-CN": "用于本次会话",
    "fr": "Utiliser pour cette session",
    "ja": "このセッションで使用",
    "ru": "Использовать в этом сеансе"
  },
  "Clear this provider's key": {
    "zh-CN": "清除此服务商的密钥",
    "fr": "Effacer la clé de ce fournisseur",
    "ja": "このプロバイダーのキーを消去",
    "ru": "Удалить ключ этого сервиса"
  },
  "Held in desktop memory for this session only. Never shared with another provider or saved to your library. The field clears after saving.": {
    "zh-CN": "仅在本次桌面会话内存中保留。不会分享给其他服务商，也不会存入资料库；保存后清空输入框。",
    "fr": "Gardée en mémoire pour cette session uniquement, jamais partagée ni enregistrée dans la bibliothèque. Le champ est ensuite vidé.",
    "ja": "このセッションのメモリにのみ保持し、他社やライブラリに保存しません。保存後に入力欄を消去します。",
    "ru": "Хранится только в памяти текущего сеанса. Не передаётся другим сервисам и не сохраняется в библиотеке. После сохранения поле очищается."
  },
  "Each question starts fresh. Quote checks help you verify evidence; they do not prove every claim is true. Local search may miss paraphrases.": {
    "zh-CN": "每个问题独立处理。引文检查便于核对证据，但不能证明所有陈述正确。本地搜索可能遗漏同义改写。",
    "fr": "Chaque question est indépendante. Les citations aident à vérifier les preuves, sans garantir chaque affirmation. La recherche locale peut manquer les reformulations.",
    "ja": "質問は毎回独立です。引用確認は根拠の確認に役立ちますが、すべての主張の正しさを保証しません。ローカル検索は言い換えを見逃す場合があります。",
    "ru": "Каждый вопрос независим. Проверка цитат помогает сверить данные, но не доказывает все утверждения. Локальный поиск может не найти перефразировки."
  },
  "Ask AI ↗": {
    "zh-CN": "询问 AI ↗",
    "fr": "Interroger l’IA ↗",
    "ja": "AI に質問 ↗",
    "ru": "Спросить ИИ ↗"
  },
  "CHECK THE ORIGINAL CONTEXT": {
    "zh-CN": "核对原文背景",
    "fr": "VÉRIFIER LE CONTEXTE ORIGINAL",
    "ja": "元の文脈を確認",
    "ru": "ПРОВЕРЬТЕ ИСХОДНЫЙ КОНТЕКСТ"
  },
  "{count} sources selected": {
    "zh-CN": "已选择 {count} 份资料",
    "fr": "{count} sources sélectionnées",
    "ja": "{count} 件の資料を選択",
    "ru": "Выбрано источников: {count}"
  },
  "{provider} API key": {
    "zh-CN": "{provider} API 密钥",
    "fr": "Clé API {provider}",
    "ja": "{provider} API キー",
    "ru": "API-ключ {provider}"
  },
  "The local service returned an unsupported provider catalog. Refresh the library to retry.": {
    "zh-CN": "本地服务返回了不支持的服务商列表，请刷新资料库重试。",
    "fr": "Liste de fournisseurs non prise en charge. Actualisez la bibliothèque.",
    "ja": "未対応のプロバイダー一覧です。ライブラリを更新してください。",
    "ru": "Неподдерживаемый список сервисов. Обновите библиотеку."
  },
  "The desktop service returned an unexpected session-setting response.": {
    "zh-CN": "桌面服务返回了异常的会话设置响应。",
    "fr": "Réponse inattendue des réglages de session.",
    "ja": "セッション設定の応答が不正です。",
    "ru": "Неожиданный ответ настроек сеанса."
  },
  "Checking the {provider} session key…": {
    "zh-CN": "正在检查 {provider} 会话密钥设置…",
    "fr": "Vérification de la clé {provider}…",
    "ja": "{provider} のキー設定を確認中…",
    "ru": "Проверка ключа сеанса {provider}…"
  },
  "{provider} key saved for this session. Account access has not been checked.": {
    "zh-CN": "{provider} 密钥已保存在本次会话中，尚未验证账户访问权限。",
    "fr": "Clé {provider} enregistrée pour cette session. L’accès au compte n’a pas été testé.",
    "ja": "{provider} のキーをこのセッション用に保存しました。アカウントの利用可否は未確認です。",
    "ru": "Ключ {provider} сохранён для сеанса. Доступ к аккаунту не проверен."
  },
  "No {provider} key is saved. Planning and your library are still available.": {
    "zh-CN": "未保存 {provider} 密钥。仍可使用规划与资料库。",
    "fr": "Aucune clé {provider}. Planification et bibliothèque restent disponibles.",
    "ja": "{provider} のキーは未保存です。計画と資料は引き続き使えます。",
    "ru": "Ключ {provider} не сохранён. Планирование и библиотека доступны."
  },
  "Enter an API key, or use Clear session key.": {
    "zh-CN": "请输入 API 密钥，或清除会话密钥。",
    "fr": "Saisissez une clé API ou effacez la clé de session.",
    "ja": "API キーを入力するか、セッションキーを消去してください。",
    "ru": "Введите API-ключ или удалите ключ сеанса."
  },
  "{provider} key saved for this session. Access is checked when you ask an AI question.": {
    "zh-CN": "{provider} 密钥已保存在本次会话中。提问时才会验证访问权限。",
    "fr": "Clé {provider} enregistrée. L’accès sera testé lors d’une question IA.",
    "ja": "{provider} のキーを保存しました。AI への質問時に利用可否を確認します。",
    "ru": "Ключ {provider} сохранён. Доступ проверяется при вопросе ИИ."
  },
  "{provider} session key cleared. Other providers, the planner and library are unchanged.": {
    "zh-CN": "已清除 {provider} 的会话密钥。其他服务商、规划与资料库不受影响。",
    "fr": "Clé {provider} effacée. Les autres fournisseurs, le planificateur et la bibliothèque restent inchangés.",
    "ja": "{provider} のキーを消去しました。他のプロバイダー、計画、資料は変わりません。",
    "ru": "Ключ {provider} удалён. Другие сервисы, планировщик и библиотека не изменены."
  },
  "Enter a question of up to 2,000 characters.": {
    "zh-CN": "请输入不超过 2,000 个字符的问题。",
    "fr": "Saisissez une question de 2 000 caractères maximum.",
    "ja": "質問は2,000文字以内で入力してください。",
    "ru": "Введите вопрос длиной до 2 000 символов."
  },
  "Choose a valid provider model in Model settings. Refresh the library to load its default.": {
    "zh-CN": "请在模型设置中选择有效模型；刷新资料库可加载默认值。",
    "fr": "Choisissez un modèle valide dans les réglages. Actualisez la bibliothèque pour sa valeur par défaut.",
    "ja": "モデル設定で有効なモデルを指定してください。ライブラリ更新で既定値を取得できます。",
    "ru": "Выберите допустимую модель в настройках. Обновите библиотеку для загрузки значения по умолчанию."
  },
  "Load the activity options before including a plan.": {
    "zh-CN": "包含计划前请先加载活动选项。",
    "fr": "Chargez les options avant d’inclure un plan.",
    "ja": "計画を含める前に活動の選択肢を読み込んでください。",
    "ru": "Сначала загрузите параметры досуга."
  },
  "Choose a scenario and wait for its sources to load.": {
    "zh-CN": "请选择场景并等待数据源加载。",
    "fr": "Choisissez un scénario et attendez ses sources.",
    "ja": "シナリオを選び、情報源の読込を待ってください。",
    "ru": "Выберите сценарий и дождитесь загрузки источников."
  },
  "Select a source or include comparison/activity preferences first.": {
    "zh-CN": "请先选择资料，或包含比较设置或活动偏好。",
    "fr": "Choisissez d’abord une source ou des préférences.",
    "ja": "資料または比較・活動の条件を先に選んでください。",
    "ru": "Сначала выберите источник или параметры сравнения/досуга."
  },
  "Reading selected evidence…": {
    "zh-CN": "正在阅读所选证据…",
    "fr": "Lecture des extraits choisis…",
    "ja": "選択した根拠を確認中…",
    "ru": "Чтение выбранных материалов…"
  },
  "Retrieving selected evidence and preparing an answer…": {
    "zh-CN": "正在检索所选证据并准备回答…",
    "fr": "Recherche des preuves et préparation de la réponse…",
    "ja": "選択した根拠を検索し、回答を準備中…",
    "ru": "Поиск выбранных данных и подготовка ответа…"
  },
  "The answer did not match the selected provider. Please try again.": {
    "zh-CN": "回答与所选服务商不符，请重试。",
    "fr": "La réponse ne correspond pas au fournisseur choisi. Réessayez.",
    "ja": "回答が選択したプロバイダーと一致しません。再試行してください。",
    "ru": "Ответ не соответствует выбранному сервису. Повторите попытку."
  },
  "INSUFFICIENT EVIDENCE": {
    "zh-CN": "证据不足",
    "fr": "PREUVES INSUFFISANTES",
    "ja": "根拠が不足しています",
    "ru": "НЕДОСТАТОЧНО ДАННЫХ"
  },
  "Open exact quote ↗": {
    "zh-CN": "查看准确引文 ↗",
    "fr": "Ouvrir la citation exacte ↗",
    "ja": "正確な引用を開く ↗",
    "ru": "Открыть точную цитату ↗"
  },
  "Simulated source": {
    "zh-CN": "模拟资料",
    "fr": "Source simulée",
    "ja": "模擬資料",
    "ru": "Модельный источник"
  },
  "Answer ready. Open a citation to check its context.": {
    "zh-CN": "回答已就绪。打开引文以核对上下文。",
    "fr": "Réponse prête. Ouvrez une citation pour vérifier le contexte.",
    "ja": "回答ができました。引用を開いて文脈を確認してください。",
    "ru": "Ответ готов. Откройте цитату и проверьте контекст."
  },
  "No supported answer was found in the selected evidence.": {
    "zh-CN": "所选证据中没有找到有依据的答案。",
    "fr": "Aucune réponse étayée dans les extraits choisis.",
    "ja": "選択した根拠では回答を裏付けられませんでした。",
    "ru": "В выбранных данных не найден подтверждённый ответ."
  },
  "Try again": {
    "zh-CN": "重试",
    "fr": "Réessayer",
    "ja": "再試行",
    "ru": "Повторить"
  },
  "AI provider changed. Ask again to use the selected provider.": {
    "zh-CN": "AI 服务商已更改，请重新提问。",
    "fr": "Fournisseur IA modifié. Posez à nouveau la question.",
    "ja": "AI プロバイダーが変わりました。再度質問してください。",
    "ru": "Сервис ИИ изменён. Задайте вопрос снова."
  },
  "Model changed. Ask again for an updated answer.": {
    "zh-CN": "模型已更改，请重新提问。",
    "fr": "Modèle modifié. Posez à nouveau la question.",
    "ja": "モデルが変わりました。再度質問してください。",
    "ru": "Модель изменена. Задайте вопрос снова."
  },
  "Question context changed. Ask again for an updated answer.": {
    "zh-CN": "问题背景已更改，请重新提问。",
    "fr": "Contexte modifié. Posez à nouveau la question.",
    "ja": "質問の条件が変わりました。再度質問してください。",
    "ru": "Контекст вопроса изменён. Задайте вопрос снова."
  },
  "Starting local service…": {
    "zh-CN": "正在启动本地服务…",
    "fr": "Démarrage du service local…",
    "ja": "ローカルサービスを起動中…",
    "ru": "Запуск локального сервиса…"
  },
  "Retry connection": {
    "zh-CN": "重试连接",
    "fr": "Réessayer la connexion",
    "ja": "接続を再試行",
    "ru": "Повторить подключение"
  },
  "Local service ready": {
    "zh-CN": "本地服务已就绪",
    "fr": "Service local prêt",
    "ja": "ローカルサービスの準備完了",
    "ru": "Локальный сервис готов"
  },
  "The desktop service could not complete this request. Please try again.": {
    "zh-CN": "桌面服务未能完成此请求，请重试。",
    "fr": "Le service n’a pas pu traiter la demande. Réessayez.",
    "ja": "処理を完了できませんでした。再試行してください。",
    "ru": "Сервис не смог выполнить запрос. Повторите попытку."
  },
  "Cannot reach the local service. Check the connection above, then retry.": {
    "zh-CN": "无法连接本地服务，请检查上方连接状态后重试。",
    "fr": "Service local inaccessible. Vérifiez la connexion puis réessayez.",
    "ja": "ローカルサービスに接続できません。接続状態を確認して再試行してください。",
    "ru": "Локальный сервис недоступен. Проверьте подключение и повторите попытку."
  },
  "The local service returned an unexpected response.": {
    "zh-CN": "本地服务返回了异常响应。",
    "fr": "Réponse inattendue du service local.",
    "ja": "ローカルサービスの応答が不正です。",
    "ru": "Неожиданный ответ локального сервиса."
  },
  "Questions and selected evidence snippets are sent to {provider}. API processing is subject to that provider's data policies.": {
    "zh-CN": "问题和选中的证据片段将发送至 {provider}，API 处理受该服务商的数据政策约束。",
    "fr": "Questions et extraits choisis sont envoyés à {provider}. Le traitement suit sa politique de données.",
    "ja": "質問と選択した根拠を {provider} に送信します。API 処理にはそのデータ方針が適用されます。",
    "ru": "Вопросы и выбранные фрагменты отправляются в {provider}. Обработка регулируется политикой данных сервиса."
  },
  "The desktop connection is unavailable. Restart Jinni and try again.": {
    "zh-CN": "桌面连接不可用，请重启 Jinni 后重试。",
    "fr": "Connexion indisponible. Redémarrez Jinni et réessayez.",
    "ja": "接続できません。Jinni を再起動して再試行してください。",
    "ru": "Соединение недоступно. Перезапустите Jinni."
  }
};
  Object.assign(native, {
  "Google Cloud project": {
    "zh-CN": "Google Cloud 项目",
    "fr": "Projet Google Cloud",
    "ja": "Google Cloud プロジェクト",
    "ru": "Проект Google Cloud"
  },
  "ADC is your Google sign-in on this computer. No API key or credential upload is needed.": {
    "zh-CN": "ADC 是此电脑上的 Google 登录凭据，无需 API 密钥或上传凭据。",
    "fr": "ADC utilise votre connexion Google sur cet ordinateur. Aucune clé API ni importation de fichier secret.",
    "ja": "ADC はこのパソコンの Google 認証情報です。API キーの入力や認証ファイルのアップロードは不要です。",
    "ru": "ADC использует вход Google на этом компьютере. Ключ API и загрузка файла учётных данных не нужны."
  },
  "Project ID": {
    "zh-CN": "项目 ID",
    "fr": "ID du projet",
    "ja": "プロジェクト ID",
    "ru": "ID проекта"
  },
  "Location": {
    "zh-CN": "位置",
    "fr": "Région",
    "ja": "ロケーション",
    "ru": "Регион"
  },
  "Run Google sign-in, then check it here.": {
    "zh-CN": "先登录 Google，再在此检查。",
    "fr": "Connectez-vous à Google, puis vérifiez ici.",
    "ja": "Google にログインしてから、ここで確認してください。",
    "ru": "Войдите в Google, затем проверьте здесь."
  },
  "Check Google sign-in": {
    "zh-CN": "检查 Google 登录",
    "fr": "Vérifier la connexion Google",
    "ja": "Google 認証を確認",
    "ru": "Проверить вход Google"
  },
  "Checking Google sign-in…": {
    "zh-CN": "正在检查 Google 登录…",
    "fr": "Vérification de la connexion Google…",
    "ja": "Google 認証を確認中…",
    "ru": "Проверка входа Google…"
  },
  "How to sign in with Google": {
    "zh-CN": "如何登录 Google",
    "fr": "Comment se connecter à Google",
    "ja": "Google 認証の設定方法",
    "ru": "Как войти в Google"
  },
  "Install Google Cloud CLI. In a terminal, run these commands, replacing YOUR_PROJECT_ID:": {
    "zh-CN": "安装 Google Cloud CLI。在终端运行以下命令，并替换 YOUR_PROJECT_ID：",
    "fr": "Installez Google Cloud CLI. Exécutez ces commandes dans un terminal en remplaçant YOUR_PROJECT_ID :",
    "ja": "Google Cloud CLI をインストールし、YOUR_PROJECT_ID を置き換えてターミナルで次のコマンドを実行してください。",
    "ru": "Установите Google Cloud CLI. Выполните команды в терминале, заменив YOUR_PROJECT_ID:"
  },
  "Link the project to your trial billing account. Choose a Gemini model available in Vertex AI Studio. Credits, quota and model access depend on Google; usage can cost money after credits run out.": {
    "zh-CN": "将项目关联到试用结算账号，选择 Vertex AI Studio 中可用的 Gemini 模型。额度、配额和模型权限由 Google 决定；额度耗尽后使用可能收费。",
    "fr": "Associez le projet à votre compte de facturation d’essai et choisissez un modèle Gemini disponible dans Vertex AI Studio. Crédits, quotas et accès dépendent de Google ; des frais sont possibles après épuisement des crédits.",
    "ja": "プロジェクトを試用の請求先アカウントに関連付け、Vertex AI Studio で利用可能な Gemini モデルを選んでください。クレジット、割り当て、利用資格は Google が管理し、クレジット消費後は料金が発生する場合があります。",
    "ru": "Свяжите проект с пробным платёжным аккаунтом и выберите доступную модель Gemini в Vertex AI Studio. Кредиты, квоты и доступ определяет Google; после исчерпания кредитов возможна оплата."
  },
  "Use your Google Cloud project ID and a location such as global or europe-west2.": {
    "zh-CN": "填写 Google Cloud 项目 ID 和位置，例如 global 或 europe-west2。",
    "fr": "Indiquez l’ID du projet Google Cloud et une région, par exemple global ou europe-west2.",
    "ja": "Google Cloud のプロジェクト ID と、global または europe-west2 などのロケーションを入力してください。",
    "ru": "Укажите ID проекта Google Cloud и регион, например global или europe-west2."
  },
  "Copy a model ID from Vertex AI Studio": {
    "zh-CN": "从 Vertex AI Studio 复制模型 ID",
    "fr": "Copiez un ID de modèle depuis Vertex AI Studio",
    "ja": "Vertex AI Studio からモデル ID をコピー",
    "ru": "Скопируйте ID модели из Vertex AI Studio"
  },
  "Google sign-in works. Project permissions, model access and billing are checked when you ask a question.": {
    "zh-CN": "Google 登录有效。项目权限、模型访问和结算将在提问时检查。",
    "fr": "La connexion Google fonctionne. Les droits du projet, l’accès au modèle et la facturation seront vérifiés lors de la question.",
    "ja": "Google 認証は有効です。プロジェクトの権限、モデルの利用資格、請求設定は質問時に確認されます。",
    "ru": "Вход Google работает. Разрешения проекта, доступ к модели и оплата проверяются при отправке вопроса."
  },
  "Google sign-in was not found or has expired. Run gcloud auth application-default login, then check again.": {
    "zh-CN": "未找到 Google 登录凭据或凭据已过期。运行 gcloud auth application-default login 后重试。",
    "fr": "Connexion Google introuvable ou expirée. Exécutez gcloud auth application-default login, puis réessayez.",
    "ja": "Google 認証情報が見つからないか期限切れです。gcloud auth application-default login を実行して再確認してください。",
    "ru": "Вход Google не найден или истёк. Выполните gcloud auth application-default login и повторите проверку."
  }
});
  Object.assign(native, {"Enter a model ID available in Vertex AI Studio.": {"zh-CN": "输入 Vertex AI Studio 中可用的模型 ID。", "fr": "Indiquez un ID de modèle disponible dans Vertex AI Studio.", "ja": "Vertex AI Studio で利用可能なモデル ID を入力してください。", "ru": "Введите ID модели, доступной в Vertex AI Studio."}});
  const shared = window.jinniMessages || {};
  const additions = Object.fromEntries(Object.entries(native).filter(([key]) => !Object.hasOwn(shared, key)));
  window.jinniI18n.registerMessages(additions);
})();
