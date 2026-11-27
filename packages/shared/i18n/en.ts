import type { Messages } from './index'

/**
 * 英語リソース。形は `ja.ts` と同じ(`satisfies Messages`)。米語・短く・UI の標準の語。
 * 3 つの状態と同意 2 つは所有者の決定済み(harema#150)。
 * ログインの見出し「Log in or sign up」は所有者の決定(2026-11-15 15:35 の決定カード・harema#150)。
 * リードは 2026-11-15 の仮の決定を再確認で確定した(所有者の決定 2026-11-22 00:12 JST・harema#150)。
 */
export const en = {
  savedPlaceStatus: {
    // 所有者の決定 2026-11-15(harema#150)
    want_to_go: 'Want to go',
    visit_again: 'Would go back',
    no_thanks: 'Not for me',
  },
  web: {
    site: {
      description: 'An app for bookmarking restaurants',
    },
    common: {
      cancel: 'Cancel',
      close: 'Close',
      menu: 'Menu',
      // 所有者の決定 2026-11-22 00:12 JST・harema#150: 言語の切り替えの名前(メニューの行の字と読み上げ名)。
      language: 'Language',
      backToTop: 'Back to home',
      retry: 'Try again',
      actionError: 'Something went wrong. Please try again.',
      invisibleCharError: ['Your text has invisible characters.', 'Remove them and try again.'],
      errorTryLater: ['Something went wrong.', 'Please wait a moment and try again.'],
    },
    sso: {
      apple: 'Continue with Apple',
      google: 'Continue with Google',
    },
    drawer: {
      closeLabel: 'Close menu',
      itemSaved: 'Saved places',
      itemUsername: 'Change username',
      itemAddHome: 'Add to Home Screen',
      itemWithdraw: 'Delete account',
      itemLogout: 'Log out',
      linkTerms: 'Terms of Use',
      linkPrivacy: 'Privacy Policy',
      irreversibleNotice: 'Cannot be undone',
      usernameDialogTitle: 'Change username',
      currentLabel: 'Current',
      usernameNewLabel: 'New username',
      usernamePlaceholder: '1–15 characters',
      usernameSubmit: 'Update',
      withdrawTitle: 'Delete your account?',
      // つないで 1 つの文として描く(withdraw-dialog)ので、1 つ目の終わりに空白を持つ。
      withdrawBody: ['Your account will be deleted. ', 'Saved places, notes, and history will be erased for good.'],
      withdrawReauth: 'Confirm with the {name} account you signed in with, and your hareMa account will be deleted right away.',
      withdrawReauthUnknown: 'Confirm with the account you signed in with, and your hareMa account will be deleted right away.',
      logoutError: ['Couldn’t log out.', 'Please wait a moment and try again.'],
    },
    error: {
      notFound: {
        heading: ['Page', 'not found'],
        lede: 'The address may have changed, or the page may be gone.',
        action: 'Back to home',
      },
      failed: {
        heading: ['We couldn’t ', 'open this screen.'],
        lede: 'Please wait a moment and try again.',
      },
    },
    login: {
      noteMark: '*',
      // 所有者の決定(2026-11-15 15:35 の決定カード・harema#150)
      heading: ['Log in or ', 'sign up'],
      // 所有者の決定 2026-11-22 00:12 JST・harema#150
      lede: ['Continue with your Apple or Google account.'],
      // 所有者の決定(harema#150): 今の案 A のまま
      consentTerms: '<ph>I agree to the <terms>Terms of Use</terms> and <privacy>Privacy Policy</privacy></ph>',
      // 所有者の決定(harema#150): 今の案 A のまま
      consentForeign:
        'I agree to my personal information being provided to overseas service providers. (Privacy Policy, Article 7)',
      notes: [
        ['New here? ', 'You can sign up from here.'],
        [
          'We can’t tell if you’re registered ',
          'until after you log in, ',
          'so even if you are, ',
          'you need to agree ',
          'each time you log in.',
        ],
      ],
    },
    // 所有者が 2026-11-21 23:48 JST に承認した文(consent-version)。本文(段落)は辞書に持たず、DB の `notice_en` から `agreement_state()` が返す。
    consentNotice: {
      title: 'Policy update',
      continue: 'Continue',
      declineLogout: 'Log out without agreeing',
    },
    homeScreen: {
      title: 'Add to Home Screen',
      body1: 'Add hareMa to your Home Screen to save places shared from other apps.',
      body2: 'You can also add it later from the menu on the right.',
      never: 'Don’t show again',
      add: 'Add',
    },
    saveSheet: {
      toastCreated: 'Saved.',
      toastUpdated: 'Updated.',
      sourceTitleUnreadable: 'Couldn’t read the title, but you can still save.',
      // 3 つの状態の名前(savedPlaceStatus.want_to_go)を含む。名前が決まったら合わせる。
      statusRevertNote: 'A rated place can’t go back to “Want to go”.',
      statusLabel: 'Status',
      memoLabel: 'Notes',
      sourceLabel: 'Source',
      memoPlaceholder: 'What caught your eye, why you want to go, etc. (optional)',
      sourcePlaceholder: 'URL or text (optional)',
      sourceHelper: 'Paste a URL and the title is read automatically (OGP).',
      ctaCreate: 'Save',
      ctaEdit: 'Update',
      deleteConfirmTitle: 'Delete this place?',
      deleteConfirmBody:
        '“{name}” will be removed from your saved places. Notes, status, and source will be erased and can’t be restored.',
      deleteConfirmBodyNoName:
        'This place will be removed from your saved places. Notes, status, and source will be erased and can’t be restored.',
      deleteLabel: 'Delete',
    },
    placeDetail: {
      backLabel: 'Back to list',
      statusCaption: 'Status',
      memoCaption: 'Notes',
      sourceCaption: 'Source',
      rowLabel: 'Details (hours, phone, website)',
      editLabel: 'Edit',
      mapsLabel: 'Open in Google Maps',
      fetchFail1: 'Couldn’t load the name and address.',
      fetchFail2: 'Please wait a moment and open it again.',
      panelHours: 'Hours',
      panelPhone: 'Phone',
      panelWebsite: 'Website',
      enterpriseFetchFail: 'Couldn’t load the details.',
    },
    // 英語の画面の日本語の店名の札と、押した後の文(所有者の決定 2026-11-25 15:47・15:53・harema#219)。
    japaneseName: {
      show: 'Show name in Japanese',
      none: 'No Japanese name.',
      same: 'Same as the name above.',
      failed: 'Couldn’t load the Japanese name.',
    },
    savedList: {
      title: 'Saved places',
      backToMap: 'Back to map',
      empty: 'No saved places yet.',
      detailsUnavailable: 'Couldn’t load this place’s info.',
    },
    // リストの画面(仮の決定・所有者の再確認待ち・harema#152)。
    lists: {
      filterAll: 'All',
      filterLabel: 'Filter by list',
      empty: 'No matching places.',
      select: 'Select',
      selectedCount: '{count} selected',
      // 「選ぶ」で上限(LIST_BULK_MAX)まで選んだ後に、もう 1 件を押した時の知らせ(失敗の知らせの器)。文言は案(所有者の文言の問いで確定する)。
      bulkLimit: 'You can select up to {count} places at a time.',
      bulkAdd: 'Add to list',
      bulkRemove: 'Remove from list',
      pickAddTitle: 'Add to which list?',
      bulkStatus: 'Change status',
      statusPickTitle: 'Choose a status',
      statusCurrent: 'Current',
      bulkDeleteConfirmTitle: 'Delete selected places?',
      bulkDeleteConfirmBody: 'Selected places ({count}) will be removed from your saved places. Notes, status, and source will be erased and can’t be restored.',
      toastAdded: 'Added to list.',
      toastRemoved: 'Removed from list.',
      toastErrorBody: 'Couldn’t update the list.',
      toastErrorTail: 'Please wait a moment and try again.',
      label: 'List',
      nameSeparator: ', ',
      pickTitle: 'Choose lists',
      pickConfirm: 'Done',
      newList: 'New list',
      editTitle: 'Edit lists',
      nameLabel: 'Name',
      namePlaceholder: 'e.g. Ramen',
      nameHelp: '1–15 characters. Spaces at the start and end are removed.',
      iconLabel: 'Icon',
      iconHelp: 'One character. Emoji, letters, and numbers are allowed.',
      iconError: 'Enter one character.',
      create: 'Create',
      deleteConfirmTitle: 'Delete this list?',
      deleteConfirmBody: '“{name}” will be deleted and can’t be restored. The places in it stay in your saved places.',
      limit: 'You can have up to 3 lists.',
    },
    map: {
      searchPlaceholder: 'Search by name or area',
      searchClear: 'Clear search',
      currentLocation: 'Back to current location',
      searchSwitch: 'Include non-restaurant places',
      locationNote: '* The map will move. Saving isn’t available.',
      toast: {
        suggestionsBody: 'Couldn’t load suggestions.',
        suggestionsTail: 'Please wait a moment and search again.',
        detailsBody: 'Couldn’t open this place.',
        detailsTail: 'Please wait a moment and select it again.',
      },
      mapsLoadFail: {
        title: 'Couldn’t display the map',
        body: 'Please wait a moment and reload.',
      },
      offline: {
        title: 'No network connection',
        body: 'Check your connection and try again.',
      },
      locationBanner: {
        // 句は inline-block の span で描くので、行末の通常の空白は捨てられる。句の間の空白は U+00A0 にしてある
        denied: ['Location is off.', 'To show where you are, ', 'allow it in your device settings.'],
        retry: 'Allowed it? Try again',
        reloadHint: ['If nothing changes, ', 'reload the page.'],
      },
    },
    onboarding: {
      heading: 'Choose a username',
      lede: ['Only you can see this name.', 'You can change it anytime.'],
      placeholder: 'e.g. Sora',
      help: '1–15 characters. Letters, numbers, symbols, and emoji are OK. Spaces at the start and end are removed.',
      submit: 'Sign up',
      abortLabel: 'Cancel sign-up',
      abortNote: 'If you cancel, you won’t be registered.',
      abortError: ['Couldn’t cancel.', 'Please wait a moment and try again.'],
    },
  },
  mobile: {
    drawer: {
      // 所有者の決定 2026-11-22 00:12 JST・harema#150: ja と同じ「言語 / Language」(どちらの言語の画面でも同じ字)。日本語の字が入るので、辞書のテストの除外に名指ししてある。
      itemLanguage: '言語 / Language',
      // 言語の行を押すと出す知らせ(harema#150)。文は仮(所有者の決定カードの答え待ち)。副ボタンは `web.common.cancel`。
      languageDialogTitle: 'Change language',
      languageDialogBody: ['When you change the language in Settings, hareMa closes.', 'Open it again to see the new language.'],
      languageDialogOpen: 'Open Settings',
    },
    login: {
      sessionExpired: 'You were logged out.',
    },
    map: {
      // 前に `web.map.locationBanner.reloadHint[0]`(「If nothing changes, 」)が付くので小文字で始める。
      retryHintSettings: 'check your device settings.',
    },
    share: {
      header: 'Save to hareMa',
      loginHeading: 'Log in to continue.',
      loginBody: ['Open hareMa and log in,', 'and you can finish saving this share.'],
      loginOpen: 'Open hareMa',
      onboardingHeading: 'Sign-up isn’t finished.',
      onboardingBody: ['Open hareMa and finish signing up,', 'and you can finish saving this share.'],
    },
  },
} satisfies Messages
