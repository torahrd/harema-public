import type { SavedPlaceStatus } from '../constants'

/**
 * 日本語リソース(辞書の正本)。`en.ts` は同じ形(`Messages`)で英語を持つ。
 * `savedPlaceStatus` は web と mobile が共有する。`web` は web のアプリの画面の文言で、
 * 同じ文は同じ鍵にする(`common`)。配列は「1 行 1 文」「句の並び」など、折る位置を文言の側が持つ所。
 * `{name}` のような差し込みの鍵と `<terms>…</terms>` のような目印は、ja と en で同じにする(i18n-dictionary のテスト)。
 */
export const ja = {
  savedPlaceStatus: {
    want_to_go: '行きたい',
    visit_again: 'また行きたい',
    no_thanks: 'もういい',
  },
  web: {
    site: {
      // 検索とリンクのカードの文(画面には出ない)。所有者の決定 2026-11-14(harema#150・Q3 の A)で「日本語」を外した。
      description: 'レストランをブックマークするアプリ',
    },
    common: {
      cancel: 'キャンセル',
      close: '閉じる',
      menu: 'メニュー',
      // 所有者の決定 2026-11-22 00:12 JST・harema#150: 言語の切り替えの名前(メニューの行の字と読み上げ名)。
      language: '言語',
      backToTop: 'トップへ戻る',
      retry: '再試行',
      actionError: 'うまくいきませんでした。もう一度お試しください。',
      invisibleCharError: ['見えない文字（制御文字）が含まれています。', '除いて、もう一度お試しください。'],
      errorTryLater: ['エラーが発生しました。', '少し待って、もう一度お試しください。'],
    },
    sso: {
      apple: 'Appleで続ける',
      google: 'Google で続ける',
    },
    drawer: {
      closeLabel: 'メニューを閉じる',
      itemSaved: '保存した店',
      itemUsername: 'ユーザー名変更',
      itemAddHome: 'ホーム画面に追加',
      itemWithdraw: '退会',
      itemLogout: 'ログアウト',
      linkTerms: '利用規約',
      linkPrivacy: 'プライバシーポリシー',
      irreversibleNotice: '取り消せません',
      usernameDialogTitle: 'ユーザー名変更',
      currentLabel: '現在',
      usernameNewLabel: '新しいユーザー名',
      usernamePlaceholder: '1〜15 文字',
      usernameSubmit: '更新する',
      withdrawTitle: '退会しますか？',
      withdrawBody: ['アカウントを削除します。', '保存した店・メモ・履歴は、すべて消え、元に戻せません。'],
      withdrawReauth: 'ログインした {name} で、確認すると、そのまま退会します。',
      withdrawReauthUnknown: 'ログインしたアカウントで、確認すると、そのまま退会します。',
      logoutError: ['ログアウトできませんでした。', '少し待って、もう一度お試しください。'],
    },
    error: {
      notFound: {
        heading: ['ページが', '見つかりません'],
        lede: 'アドレスが変わったか、なくなった可能性があります。',
        action: 'トップへ戻る',
      },
      failed: {
        heading: ['画面を', '開けませんでした。'],
        lede: '少し待って、もう一度お試しください。',
      },
    },
    login: {
      noteMark: '※',
      heading: ['ログイン・登録'],
      lede: ['Apple か Google の', 'アカウントで続けます。'],
      // `<ph>` は折らない塊の句(幅の狭い所では句の切れ目で折れる)
      consentTerms: '<ph><terms>利用規約</terms>と</ph><ph><privacy>プライバシーポリシー</privacy>に同意</ph>',
      consentForeign: '海外の事業者への、個人情報の提供に同意する。(プライバシーポリシー第 7 条)',
      notes: [
        ['はじめての方も、', 'ここから登録できます。'],
        ['登録の有無は', 'ログインの後に分かるため、', '登録済みの方も、', 'ログインのたびに', '同意が要ります。'],
      ],
    },
    // 改定のお知らせ(地図を開いた時・同意の記録が今のバージョンに無い人だけ。web と iOS で同じ鍵)。本文(段落)は辞書に持たず、DB の `private.legal_revisions` の `notice_ja`・`notice_en` から `agreement_state()` が返す({date} は適用の日 = `notice_effective_on`)。
    // 同意の行はログイン画面の `login.consentTerms`、記録の失敗は `common.errorTryLater`、ログアウトの失敗は `drawer.logoutError` を使う。
    consentNotice: {
      title: '改定のお知らせ',
      continue: '続ける',
      declineLogout: '同意しないでログアウト',
    },
    homeScreen: {
      title: 'ホーム画面に追加',
      body1: 'ホーム画面に追加すると、ほかのアプリの共有から保存できます。',
      body2: '右のメニューからも、あとで追加できます。',
      never: 'もう表示しない',
      add: '追加する',
    },
    saveSheet: {
      toastCreated: '保存しました。',
      toastUpdated: '更新しました。',
      sourceTitleUnreadable: 'タイトルは読み取れませんでしたが、このまま保存できます。',
      statusRevertNote: '評価済みから「行きたい」へは戻せません。',
      statusLabel: '状態',
      memoLabel: 'メモ',
      sourceLabel: '出典',
      memoPlaceholder: '気になったこと、行きたい理由など（任意）',
      sourcePlaceholder: 'URL またはテキスト（任意）',
      sourceHelper: 'URL を貼ると、タイトルを自動で読み取ります（OGP）。',
      ctaCreate: '保存する',
      ctaEdit: '更新する',
      deleteConfirmTitle: '削除しますか？',
      deleteConfirmBody: '「{name}」を、保存した店から削除します。メモ・状態・出典も消え、元に戻せません。',
      deleteConfirmBodyNoName: 'この店を、保存した店から削除します。メモ・状態・出典も消え、元に戻せません。',
      deleteLabel: '削除する',
    },
    placeDetail: {
      backLabel: '一覧へ戻る',
      statusCaption: '状態',
      memoCaption: 'メモ',
      sourceCaption: '出典',
      rowLabel: '詳細情報（営業時間・電話・website）',
      editLabel: '編集する',
      mapsLabel: 'Google マップで開く',
      fetchFail1: '店の名前と住所を読み込めませんでした。',
      fetchFail2: '少し待って、もう一度開いてください。',
      panelHours: '営業時間',
      panelPhone: '電話',
      panelWebsite: 'website',
      enterpriseFetchFail: '詳細情報を読み込めませんでした。',
    },
    // 英語の画面の日本語の店名の札と、押した後の文(所有者の決定 2026-11-25 15:47・15:53・harema#219)。
    // ja の値は画面に出ない(日本語の画面は札を置かない)。型 `Messages = typeof ja` が鍵を ja に要求するので、en の文の訳を置く。
    japaneseName: {
      show: '日本語の店名を表示',
      none: '日本語の店名はありません。',
      same: '上の店名と同じです。',
      failed: '日本語の店名を読み込めませんでした。',
    },
    savedList: {
      title: '保存した店',
      backToMap: '地図へ戻る',
      empty: '保存した店は、まだありません。',
      detailsUnavailable: '店舗の情報を読み込めませんでした。',
    },
    // リストの画面(仮の決定・所有者の再確認待ち・harema#152)。文言の出どころ: 単位 lists-web の DESIGN.md の 5。
    lists: {
      filterAll: 'すべて',
      filterLabel: 'リストで絞る',
      empty: '当てはまる店はありません。',
      select: '選ぶ',
      selectedCount: '{count} 件を選択中',
      // 「選ぶ」で上限(LIST_BULK_MAX)まで選んだ後に、もう 1 件を押した時の知らせ(失敗の知らせの器)。
      bulkLimit: '一度に選べるのは {count} 件までです。',
      bulkAdd: 'リストに入れる',
      bulkRemove: 'リストから外す',
      pickAddTitle: '入れるリストを選ぶ',
      bulkStatus: '状態を変える',
      statusPickTitle: '状態を選ぶ',
      statusCurrent: '今の状態',
      bulkDeleteConfirmTitle: '削除しますか？',
      bulkDeleteConfirmBody: '選んだ {count} 件の店を、保存した店から削除します。メモ・状態・出典も消え、元に戻せません。',
      toastAdded: 'リストに入れました。',
      toastRemoved: 'リストから外しました。',
      toastErrorBody: 'リストを変更できませんでした。',
      toastErrorTail: '少し待って、もう一度お試しください。',
      label: 'リスト',
      // 行の右に、入っているリストの名前をつなぐ区切り。
      nameSeparator: '、',
      pickTitle: 'リストを選ぶ',
      pickConfirm: '決定する',
      newList: '新しいリスト',
      editTitle: 'リストを編集',
      nameLabel: '名前',
      namePlaceholder: '例: ラーメン',
      nameHelp: '1〜15字。前後の空白は除かれます。',
      iconLabel: 'アイコン',
      iconHelp: '1字。絵文字・漢字・かな・英字・数字が使えます。',
      iconError: '1字だけ入れてください。',
      create: '作成する',
      deleteConfirmTitle: 'リストを削除しますか？',
      deleteConfirmBody: '「{name}」を削除します。元に戻せません。入れていた店は消えず、保存した店に残ります。',
      limit: 'リストは 3 個までです。',
    },
    map: {
      searchPlaceholder: '店名・場所で検索',
      searchClear: '検索をクリア',
      currentLocation: '現在地に戻る',
      searchSwitch: '飲食店以外を検索結果に含める',
      locationNote: '※マップが移動します。保存はできません。',
      toast: {
        suggestionsBody: '候補を探せませんでした。',
        suggestionsTail: '少し待って、もう一度検索してください。',
        detailsBody: 'この場所を開けませんでした。',
        detailsTail: '少し待って、もう一度お選びください。',
      },
      mapsLoadFail: {
        title: '地図を表示できませんでした',
        body: '少し待って、もう一度読み込んでください。',
      },
      offline: {
        title: 'ネットワークに接続できません',
        body: '接続を確認して、もう一度お試しください。',
      },
      locationBanner: {
        denied: ['位置情報がオフです。', '現在地の表示には、', '端末の設定から許可が必要です。'],
        retry: '許可したら、もう一度試す',
        reloadHint: ['変わらないときは、', 'ページを再読み込みしてください。'],
      },
    },
    onboarding: {
      heading: 'ユーザー名の入力',
      lede: ['あなたにだけ見える名前です。', 'あとから、いつでも変えられます。'],
      placeholder: '例: そら',
      help: '1〜15字。日本語・英数・記号・絵文字が使えます。前後の空白は除かれます。',
      submit: '登録する',
      abortLabel: '登録を中止する',
      abortNote: '中止すると登録は行われません。',
      abortError: ['中止できませんでした。', '少し待って、もう一度お試しください。'],
    },
  },
  // iOS のアプリの文言。web と同じ文は `web` の鍵を読み、ここには iOS にだけある文を置く(apps/mobile/src/i18n)。
  mobile: {
    drawer: {
      // 所有者の決定 2026-11-22 00:12 JST・harema#150: iOS のメニューの言語の行。どちらの言語の画面でも同じ字(押すと知らせを出す)。
      itemLanguage: '言語 / Language',
      // 言語の行を押すと出す知らせ(harema#150)。文は仮(所有者の決定カードの答え待ち)。副ボタンは `web.common.cancel`。
      languageDialogTitle: '言語を変える',
      languageDialogBody: ['「設定」で言語を変えると、hareMa は一度終了します。', 'もう一度開くと、選んだ言語で表示されます。'],
      languageDialogOpen: '設定を開く',
    },
    login: {
      // ログインが無効と分かってログイン画面へ送られた時の知らせ(所有者 2026-11-11 21:18 の決定)。
      sessionExpired: 'ログアウトされました。',
    },
    map: {
      // 位置情報の帯の次の一手の 2 節目。1 節目は web と同じ(`web.map.locationBanner.reloadHint[0]`)。
      retryHintSettings: '端末の設定を確認してください。',
    },
    // 共有の拡張(Share Extension)の文言。所有者が確かめた物(2026-11-03・2026-11-05・harema#46)。
    share: {
      header: 'hareMa に保存',
      loginHeading: 'ログインが必要です。',
      loginBody: ['hareMa を開いてログインすると、', 'この共有の続きから保存できます。'],
      loginOpen: 'hareMa を開く',
      onboardingHeading: '登録が済んでいません。',
      onboardingBody: ['hareMa を開いて登録を終えると、', 'この共有の続きから保存できます。'],
    },
  },
} satisfies { savedPlaceStatus: Record<SavedPlaceStatus, string>; web: object; mobile: object }
