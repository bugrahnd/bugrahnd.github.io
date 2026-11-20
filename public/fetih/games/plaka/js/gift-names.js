// TikTok gift names (English feed name <-> Turkish app name). The map now lives in
// shared/gift-names.js so every game and the bridge use the same one. This page is served at
// games/plaka/js/ (bridge and hosted build alike), so the shared folder is three levels up.
export * from '../../../shared/gift-names.js';
