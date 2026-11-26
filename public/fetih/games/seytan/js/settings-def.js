// Streamer settings of Şeytan Avı: panel schema (flat keys, Turkish labels) and defaults.
// Used by the bridge (games/seytan/settings.mjs re-exports it) and by the page (main.js).
// No DOM: it must also load in Node.

const G_ROUND = 'Tur';
const G_DEVIL = 'Şeytan';
const G_HITS = 'Taşlar ve hediyeler';
const G_VIEW = 'Görünüm';

export const schema = {
  'round.sec': { label: 'Tur süresi', type: 'int', min: 30, max: 600, unit: 'saniye', group: G_ROUND, nextRound: true, hint: 'Şeytanın canı bu sürede sıfırlanmazsa şeytan kahkaha atar ve yeni tur başlar.' },
  'round.resultSec': { label: 'Sonuç ekranı süresi', type: 'int', min: 3, max: 30, unit: 'saniye', group: G_ROUND, hint: 'Kazanma ya da kahkaha ekranının ekranda kaldığı süre.' },
  'round.countdownSec': { label: 'Tur öncesi geri sayım', type: 'int', min: 0, max: 10, unit: 'saniye', group: G_ROUND, hint: 'Yeni tur başlamadan önceki geri sayım (0 = yok).' },

  'devil.hp': { label: 'Şeytanın canı', type: 'int', min: 100, max: 1000000, group: G_DEVIL, nextRound: true, hint: 'Tur başındaki can. Bir gül (1 jeton) varsayılan ayarlarla 25 hasar verir.' },
  'devil.adaptive': { label: 'Can kendini ayarlasın', type: 'bool', group: G_DEVIL, hint: 'Açıkken şeytan yenilince sonraki tur canı %25 artar, kaçamayınca %15 azalır (ayardaki canın altına inmez).' },
  'devil.hide': { label: 'Şeytan saklansın', type: 'bool', group: G_DEVIL, hint: 'Açıkken şeytan tapınakçığın, kaya bahçesinin ve sakura ağacının arkasına saklanır; saklanırken taşlar daha az işler.' },
  'devil.coverPct': { label: 'Siperdeyken işleyen hasar', type: 'int', min: 0, max: 100, unit: '%', group: G_DEVIL, hint: 'Şeytan saklanırken taşların hasarının yüzde kaçı işler. Mancınık ve kayan yıldız siperi yıkar, tam işler.' },
  'devil.speed': { label: 'Kaçma hızı', type: 'num', min: 0.4, max: 2.5, step: 0.1, group: G_DEVIL, hint: '1 = normal. Büyük değerlerde şeytan daha sık yer değiştirir.' },

  'like.enabled': { label: 'Beğeniler küçük taş atsın', type: 'bool', group: G_HITS, hint: 'Açıkken her beğeni şeytana küçük bir taş atar (ekranda çağrı ya da ödül yazısı yoktur).' },
  'like.dmg': { label: 'Küçük taş hasarı', type: 'num', min: 0, max: 100, step: 0.5, group: G_HITS, hint: 'Bir beğeninin (küçük taşın) verdiği hasar.' },
  'gift.dmgPerCoin': { label: 'Jeton başına hasar', type: 'num', min: 1, max: 1000, step: 1, group: G_HITS, hint: 'Hediyelerin verdiği hasar = jeton × bu değer (× basamak bonusu).' },
  'gift.tierBonus': { label: 'Büyük basamaklara hasar bonusu', type: 'bool', group: G_HITS, hint: 'Açıkken hasar basamağa göre artar: büyük taş ×1, kaya yağmuru ×1,1, ateş okları ×1,2, mancınık ×1,35, tılsım zinciri ×1,5, kayan yıldız ×1,75, ejderha ×2.' },
  'tier.rain': { label: 'Kaya yağmuru: en az jeton', type: 'int', min: 2, max: 100000, unit: 'jeton', group: G_HITS, hint: 'Bu değerin altındaki hediyeler büyük taş atar; bu değer ve üstü kaya yağmuru yağdırır.' },
  'tier.arrows': { label: 'Ateş okları: en az jeton', type: 'int', min: 3, max: 100000, unit: 'jeton', group: G_HITS, hint: 'Kalabalıktan alevli ok sağanağı; şeytan birkaç saniye yanar ve yanarken can kaybeder.' },
  'tier.catapult': { label: 'Mancınık: en az jeton', type: 'int', min: 4, max: 100000, unit: 'jeton', group: G_HITS, hint: 'Mancınık aşağıdan gelir, alevli kaya fırlatır (jetona göre 1–4 atış), siperi yıkar.' },
  'tier.chains': { label: 'Tılsım zinciri: en az jeton', type: 'int', min: 5, max: 1000000, unit: 'jeton', group: G_HITS, hint: 'Kutsal zincirler şeytanı birkaç saniye yerine bağlar: saklanamaz, herkesin taşı tam hasar verir.' },
  'tier.meteor': { label: 'Kayan yıldız: en az jeton', type: 'int', min: 6, max: 1000000, unit: 'jeton', group: G_HITS, hint: 'Gök kararır, şeytana bir kayan yıldız (şihap) düşer ve onu sersemletir.' },
  'tier.dragon': { label: 'Ejderha: en az jeton', type: 'int', min: 7, max: 1000000, unit: 'jeton', group: G_HITS, hint: 'Ejderha gökten süzülür, şeytana ateş püskürür, bütün siperleri yıkar.' },
  'chains.sec': { label: 'Zincirde kalma süresi', type: 'num', min: 1, max: 15, step: 0.5, unit: 'saniye', group: G_HITS, hint: 'Tılsım zincirinin şeytanı yerinde tuttuğu süre.' },

  'view.names': { label: 'İsabetlerde isim', type: 'bool', group: G_VIEW, hint: 'Her isabette taşı atanın adı çıkar (beğeni isimleri sık olmasın diye seyreltilir).' },
  'view.ladder': { label: 'Hediye rehberi (fiyatlı liste)', type: 'bool', group: G_VIEW, hint: 'Hangi hediyenin kaç jetonla ne yaptığını gösteren sütun. Varsayılan kapalı: TikTok, ekranda sürekli duran fiyatlı hediye listesini hediye istemek sayabiliyor (2026-11-26 hediye askıya alma cezası).' },
  'view.board': { label: 'Canlı sıralama', type: 'bool', group: G_VIEW, hint: 'Tur boyunca en çok taş atan 3 kişi yan tarafta görünür.' },
};

export const defaults = {
  'round.sec': 120,
  'round.resultSec': 8,
  'round.countdownSec': 3,
  'devil.hp': 5000,
  'devil.adaptive': true,
  'devil.hide': true,
  'devil.coverPct': 50,
  'devil.speed': 1,
  'like.enabled': true,
  'like.dmg': 2,
  'gift.dmgPerCoin': 25,
  'gift.tierBonus': true,
  'tier.rain': 10,
  'tier.arrows': 50,
  'tier.catapult': 250,
  'tier.chains': 600,
  'tier.meteor': 1000,
  'tier.dragon': 1500,
  'chains.sec': 5,
  'view.names': true,
  'view.ladder': false,
  'view.board': true,
};
