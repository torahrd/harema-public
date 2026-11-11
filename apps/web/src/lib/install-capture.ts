// ホーム画面に追加する案内の「捕まえ」。Chrome の `beforeinstallprompt` は hydration より前に来ることがあり、
// 受け損ねると、その読み込みではモーダルもメニューの項目も出ない。root の layout が `<body>` の先頭に置く素の
// `<script dangerouslySetInnerHTML>`(inline・新しい外部の読み込みなし)は、HTML にそのまま出て解析時に同期で走る。
// (`next/script` の `beforeInteractive` は HTML に本文が出ず、Next の起動の直前まで走らないので使わない。)
// Android かつ standalone でない時だけ事件を `preventDefault()` して window の 1 つの名前に預ける。
// map の hook(use-install-prompt.ts)は mount の時に預けられた物を先に読み、その後は自分の listener で受ける。
// 判定の規則は lib/install-prompt.ts の isAndroidDevice・installPromptAvailable と同じ(テストが script を実行して確かめる)。
// 相対 import だけで書く(別名の import も持たない)。

/** window に預ける名前。値は { event: 事件 | null, installed: boolean }。 */
export const INSTALL_CAPTURE_KEY = '__haremaInstall'

export const INSTALL_CAPTURE_SCRIPT = `(function(){try{
var w=window,s={event:null,installed:false};w.${INSTALL_CAPTURE_KEY}=s;
var d=navigator.userAgentData,p=d&&typeof d.platform==='string'&&d.platform!==''?d.platform:null;
var a=p!==null?p==='Android':/Android/i.test(navigator.userAgent);
var sa=!!(w.matchMedia&&w.matchMedia('(display-mode: standalone)').matches);
if(!a||sa)return;
w.addEventListener('beforeinstallprompt',function(e){e.preventDefault();s.event=e});
w.addEventListener('appinstalled',function(){s.installed=true;s.event=null});
}catch(_){}})();`
