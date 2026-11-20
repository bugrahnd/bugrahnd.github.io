// Streamer settings of Halat Çekme: the panel schema (flat keys, Turkish labels), their
// defaults (taken from defaults.js) and the mapping from flat values onto the game config.
// Used by the bridge (games/halat/settings.mjs re-exports schema/defaults) and by the page
// (core.js applySettings). No DOM, no three.js: it must also load in Node.
import { DEFAULT_CONFIG } from './defaults.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Group names (the panel shows one fieldset per group). */
export const ENGAGE_GROUP = 'Etkileşim ödülleri (TikTok kısıtlayabilir)';
const G_TEAMS = 'Takımlar';
const G_ROUND = 'Tur';
const G_FORCE = 'Güç';
const G_TIERS = 'Hediye kademeleri';
const G_VIEW = 'Görünüm';

const TIER_INFO = {
  tug: { name: 'Kısa asılma', what: 'halatı bir anlık çeker (gül gibi küçük hediyeler)' },
  helper_s: { name: 'Yardımcı', what: 'takıma kısa süreli bir yardımcı çekici koşar' },
  helper_m: { name: 'Güçlü yardımcı', what: 'daha güçlü bir yardımcı çekici' },
  helper_l: { name: 'Usta çekici', what: 'en güçlü yardımcı çekici' },
  strongman: { name: 'Pehlivan', what: 'bir pehlivan halata geçer' },
  strongman2: { name: 'Çifte pehlivan', what: 'iki pehlivan halata geçer' },
  tractor: { name: 'Traktör', what: 'halatın ucuna traktör bağlanır' },
  giant: { name: 'Dev', what: 'dev halatın başına geçer' },
};

const teamSchema = (n) => {
  const t = DEFAULT_CONFIG.teams[n - 1];
  return {
    [`team${n}.name`]: { label: `${n}. takımın adı`, type: 'str', max: 12, group: G_TEAMS, hint: 'Ekranda ve sonuçta yazan takım adı. Bu ad da katılma kelimesi olarak kabul edilir.' },
    [`team${n}.color`]: { label: `${n}. takımın rengi`, type: 'str', max: 7, group: G_TEAMS, hint: `Onaltılık renk kodu, # ile (ör. ${t.color}). Formalar, bayraklar, seyirciler ve paneller bu renge boyanır.` },
    [`team${n}.key`]: { label: `${n}. takımın katılma tuşu`, type: 'str', max: 3, group: G_TEAMS, hint: `İzleyicinin sohbete yazdığı kısa işaret (varsayılan ${t.key}). Alt şeritte "Katılmak için … yaz" yazısında görünür.` },
    [`team${n}.words`]: { label: `${n}. takıma katılma kelimeleri`, type: 'str', max: 80, group: G_TEAMS, hint: 'Virgülle ayrılmış ek kelimeler. Büyük/küçük harf ve Türkçe karakter farkı gözetilmez; takım adı ve katılma tuşu her zaman geçerlidir.' },
  };
};

const tierSchema = () => {
  const out = {};
  for (const t of DEFAULT_CONFIG.gifts.tiers) {
    const i = TIER_INFO[t.id] || { name: t.label, what: '' };
    out[`tier.${t.id}.min`] = { label: `${i.name}: en az jeton`, type: 'int', min: 1, max: 100000, unit: 'jeton', group: G_TIERS, hint: `Tek hediyenin değeri bu kadar ya da üstündeyse ${i.what}. Kademeler artan sırada olmalı; her hediye en yüksek uyan kademeyi alır.` };
    out[`tier.${t.id}.force`] = { label: `${i.name}: güç`, type: 'num', min: 0, max: 2000, step: 0.5, group: G_TIERS, hint: 'Takımın çekiş gücüne eklenen miktar (bir izleyici yaklaşık 1).' };
    out[`tier.${t.id}.sec`] = { label: `${i.name}: süre`, type: 'num', min: 0.5, max: 120, step: 0.1, unit: 'saniye', group: G_TIERS, hint: 'Gücün ve figürün sahada kaldığı süre.' };
    out[`tier.${t.id}.label`] = { label: `${i.name}: ekrandaki yazı`, type: 'str', max: 18, group: G_TIERS, hint: 'Hediye merdiveninde ve hediye şeridinde görünen etki yazısı.' };
  }
  return out;
};

/** Panel schema (types and fields as in server/settings.js). */
export const schema = {
  ...teamSchema(1),
  ...teamSchema(2),
  'join.resetEachRound': { label: 'Takımlar her tur sıfırlansın', type: 'bool', group: G_ROUND, hint: 'Açıkken her yeni turda herkes takımını yeniden yazar. Kapalıyken takım seçimi yayın boyunca geçerlidir.' },
  'round.durationSec': { label: 'Tur süresi', type: 'int', min: 20, max: 600, unit: 'saniye', group: G_ROUND, nextRound: true, hint: 'Halat bu sürede çukura ulaşmazsa halatın durduğu taraf kazanır.' },
  'round.lobbySec': { label: 'Turlar arası bekleme', type: 'int', min: 2, max: 60, unit: 'saniye', group: G_ROUND, hint: 'Sonuçtan sonra geri sayıma kadar geçen hazırlık süresi.' },
  'round.resultSec': { label: 'Sonuç ekranı süresi', type: 'int', min: 3, max: 60, unit: 'saniye', group: G_ROUND, hint: 'Kazananın ve halat başlarının gösterildiği süre.' },
  'visual.pullersPerSide': { label: 'Halattaki çekici sayısı (her takım)', type: 'int', min: 3, max: 12, group: G_VIEW, hint: 'Halatta tam figürle görünen kişi sayısı; fazlası seyirci olarak ve kişi sayacında görünür. Uzun sıraların ucu kadrajdan çıkar.' },
  'visual.nameTags': { label: 'İsim etiketleri', type: 'bool', group: G_VIEW, hint: 'Halat başı, pehlivan, dev ve yeni katılanların başında isim görünür.' },
  'force.perMember': { label: 'Kişi başı güç', type: 'num', min: 0.1, max: 10, step: 0.1, group: G_FORCE, hint: 'Takımdaki her izleyicinin temel çekiş gücü.' },
  'force.memberExponent': { label: 'Kalabalık üssü', type: 'num', min: 0.3, max: 1, step: 0.05, group: G_FORCE, hint: 'Takım gücü = kişi başı güç × kişi sayısı ^ üs. 1: her kişi tam sayılır; küçük değerler kalabalık takımın üstünlüğünü azaltır (0,6: 20 kişi ≈ 6, 200 kişi ≈ 24).' },
  ...tierSchema(),
  'force.likeForce': { label: 'Beğeni gücü', type: 'num', min: 0, max: 5, step: 0.1, group: ENGAGE_GROUP, hint: 'Kapalı (0) önerilir: TikTok beğeniyi ödüllendiren yayınların görünürlüğünü kısıtlayabilir. Takım üyesinin her beğenisi kısa süre bu kadar güç ekler.' },
  'force.chatForce': { label: 'Sohbet gücü', type: 'num', min: 0, max: 5, step: 0.1, group: ENGAGE_GROUP, hint: 'Kapalı (0) önerilir. Takım üyesinin mesajı (8 saniyede bir) kısa süre güç ekler.' },
  'force.followForce': { label: 'Takip gücü', type: 'num', min: 0, max: 50, step: 0.5, group: ENGAGE_GROUP, hint: 'Kapalı (0) önerilir. Takip eden takım üyesi birkaç saniye güç ekler.' },
  'force.shareForce': { label: 'Paylaşım gücü', type: 'num', min: 0, max: 50, step: 0.5, group: ENGAGE_GROUP, hint: 'Kapalı (0) önerilir. Paylaşan takım üyesi birkaç saniye güç ekler.' },
};

/** Flat values of a config (for the defaults and the page's own defaults). */
export function flatFromConfig(c = DEFAULT_CONFIG) {
  const o = {};
  c.teams.slice(0, 2).forEach((t, i) => {
    const n = i + 1;
    o[`team${n}.name`] = t.name;
    o[`team${n}.color`] = t.color;
    o[`team${n}.key`] = String(t.key ?? n);
    o[`team${n}.words`] = (t.words || []).join(', ');
  });
  o['join.resetEachRound'] = !!c.join.resetEachRound;
  o['round.durationSec'] = c.round.durationSec;
  o['round.lobbySec'] = c.round.lobbySec;
  o['round.resultSec'] = c.round.resultSec;
  o['visual.pullersPerSide'] = c.visual.pullersPerSide;
  o['visual.nameTags'] = c.visual.nameTags !== false;
  o['force.perMember'] = c.force.perMember;
  o['force.memberExponent'] = c.force.memberExponent;
  for (const t of c.gifts.tiers) {
    o[`tier.${t.id}.min`] = t.min;
    o[`tier.${t.id}.force`] = t.force;
    o[`tier.${t.id}.sec`] = t.sec;
    o[`tier.${t.id}.label`] = t.label;
  }
  o['force.likeForce'] = c.force.likeForce;
  o['force.chatForce'] = c.force.chatForce;
  o['force.followForce'] = c.force.followForce;
  o['force.shareForce'] = c.force.shareForce;
  return o;
}

/** Bridge-side defaults (games/halat/settings.mjs). */
export function defaults() { return flatFromConfig(DEFAULT_CONFIG); }

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * Applies flat settings values (this game's keys plus the stream-wide layout.* / audio.*)
 * onto a config object (mutated and returned). Unknown dotted keys set that config path;
 * invalid values keep the config's own value.
 */
export function applyFlatSettings(cfg, values) {
  const v = values && typeof values === 'object' ? values : {};
  const setPath = (path, val) => {
    const parts = path.split('.');
    if (parts.some((p) => p === '__proto__' || p === 'constructor' || p === 'prototype')) return;
    let o = cfg;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = val;
  };
  for (const [k, val] of Object.entries(v)) {
    if (val === null || val === undefined) continue;
    let m;
    if ((m = /^team([12])\.(name|color|key|words)$/.exec(k))) {
      const t = cfg.teams[Number(m[1]) - 1];
      if (!t) continue;
      if (m[2] === 'words') t.words = String(val).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
      else if (m[2] === 'color') { if (HEX.test(String(val).trim())) t.color = '#' + String(val).trim().replace('#', ''); }
      else if (String(val).trim()) t[m[2]] = String(val).trim();
    } else if ((m = /^tier\.(\w+)\.(min|force|sec|label)$/.exec(k))) {
      const t = cfg.gifts.tiers.find((x) => x.id === m[1]);
      if (!t) continue;
      if (m[2] === 'label') { if (String(val).trim()) t.label = String(val).trim(); }
      else t[m[2]] = Math.max(m[2] === 'min' ? 1 : 0, num(val, t[m[2]]));
    } else if (k === 'audio.masterPct') cfg.audio.master = num(val, 100) / 100;
    else if (k === 'audio.musicPct') cfg.audio.music = num(val, 32) / 100;
    else if (k === 'audio.sfxPct') cfg.audio.sfx = num(val, 75) / 100;
    else if (k === 'audio.mute') cfg.audio.mute = val === true;
    else if (k === 'round.durationMin') cfg.round.durationSec = num(val, 1.5) * 60;
    else if (k.includes('.')) setPath(k, val);
  }
  // Tiers must stay in rising order of their minimum (the core picks the highest that fits).
  cfg.gifts.tiers.sort((a, b) => a.min - b.min);
  return cfg;
}

/** Fresh config with flat values applied (tests). */
export function configWith(values) { return applyFlatSettings(clone(DEFAULT_CONFIG), values); }
