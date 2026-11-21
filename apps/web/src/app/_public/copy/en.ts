// 公開ページの英語の文。形は ja.ts と同じ(型で縛る)。日本語にない約束を足さない・他サービスの名前を足さない
// (今ある Apple・Google・App Store・iPhone・Android・Chrome・X は、日本語の本文にある物と同じ所にだけ置く)。
// 英語は語の間で折れるので、折れの印(index.ts の RICH_MARKS)を使わない。3 つの状態の語は packages/shared/i18n/en.ts と同じ。
import type { PublicCopy } from './index'

export const en = {
  lang: 'en',
  nav: {
    pageLabel: 'Page',
    about: 'About',
    login: 'Log in',
    footerLabel: 'Footer',
    contactX: 'Contact us on X ↗',
    terms: 'Terms of Use',
    privacy: 'Privacy Policy',
    backToTop: 'Back to home',
    language: 'Language',
  },
  home: {
    title: 'hareMa',
    description: 'hareMa is an app for saving, on a map, the restaurants you want to go to and would go back to. Search for a place and save it, sort it into “Want to go”, “Would go back”, or “Not for me”, and look back at it on the map or in a list. It is for people who want to build their own restaurant list.',
    h1: 'All your scattered places, on one map.',
    lead: ['An app for making your own map that shows only the places you should visit: your “Want to go” and “Would go back” places.'],
    cta: 'Get started',
    actNote: 'Start right in your browser with an Apple or Google account.',
    actFree: 'Free to use.',
    appStoreAlt: 'Download on the App Store',
    shotMapAlt: 'The hareMa map screen. A search bar and pins for saved places (16 “Want to go” and 8 “Would go back”) on the map.',
    shotNearbyAlt: 'The hareMa map screen. A dot for your current location and pins for nearby saved places (16 “Want to go” and 8 “Would go back”).',
    useHeading: 'How it works, in three steps.',
    steps: [
      { no: '01', name: 'Save', text: 'Save a place that catches your eye, on the spot.' },
      { no: '02', name: 'See it on the map', text: 'Places you want to go near where you are show up as pins.' },
      { no: '03', name: 'Rate it', text: 'After you visit, mark it “Would go back” or “Not for me”. “Not for me” places disappear from the map.' },
    ],
    diffHeading: 'No more digging through screenshots and notes.',
    diffBody: [
      'Places you saved on social media do not show up on your map. Even if you save them again in a map app, the link you found and your reasons are not kept.',
      'When you are out, or looking for a second place, you switch between two apps and search all over again.',
      'After you go, the place stays on your list. To take a place you will not visit again off your list, you have to delete it from both apps.',
      'With hareMa, when you save a place you can also keep the link you found and a note on why. Places marked “Want to go” and “Would go back” appear on the map, so you can see what is nearby.',
      'After you go, just move the place to “Not for me”, and it disappears from the map right away. hareMa does not show other people’s ratings or recommendations. Only the places you should visit stay on your map.',
    ],
    beforeHeading: 'Before you start',
    facts: {
      login: { name: 'Log in', text: 'You log in with an Apple or Google account. hareMa does not keep passwords, and apart from your username, does not store your email address or name in its database.' },
      data: { name: 'Data', text: 'Places you save are not shown to other users. When you delete your account, your account and saved places are deleted.' },
      operator: { name: 'Operator', text: 'The hareMa operator. Inquiries are accepted on {x}.', xLabel: 'X (@htoranosuke) ↗' },
      app: {
        name: 'App',
        text: 'With the iPhone app, you can save from the share menu of other apps without switching apps.',
        storeLink: 'View on the App Store ↗',
        qrNote: 'Scan with your iPhone camera to open the App Store.',
        android: 'On Android, add hareMa to your home screen in Chrome, and you can save from the share menu of other apps.',
      },
    },
    newsHeading: 'Updates',
    newsAll: 'See all updates',
    credit: 'Apple, the Apple logo, App Store, and iPhone are trademarks of Apple Inc.',
  },
  news: {
    title: 'Updates | hareMa',
    caption: 'UPDATES',
    heading: 'Updates',
  },
  terms: {
    title: 'Terms of Use | hareMa',
    caption: 'TERMS',
    revised: 'Last revised',
  },
  privacy: {
    title: 'Privacy Policy | hareMa',
    caption: 'PRIVACY',
    revised: 'Last revised',
  },
} satisfies PublicCopy
