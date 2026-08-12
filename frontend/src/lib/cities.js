// Keys are stored in DB; labels are translated in i18n.jsx.
//
// Deliberately Arab towns/cities in Israel only — not the "mixed" cities
// (Jerusalem, Haifa, Jaffa, Acre, Lod, Ramla) or Jewish-majority cities
// the list used to include. Matches this app's audience: Arabic is the
// default language, and every previous entry was already an Arab or Arab-
// majority locality except those mixed/Jewish ones. Grouped by region
// (Galilee/North, Triangle, Negev) purely for readability here — display
// order is always locale-sorted at render time (sortCityKeysForDisplay).
export const CITY_KEYS = [
  // Galilee / North
  "nazareth",
  "shfaram",
  "sakhnin",
  "arrabe",
  "deir_hanna",
  "majd_al_krum",
  "kafr_kanna",
  "tamra",
  "kafr_yasif",
  "yirka",
  "judeide_maker",
  "maghar",
  "beit_jann",
  "daliyat_al_karmel",
  "isfiya",
  "kafr_manda",
  "nahf",
  "rameh",
  "bi_ina",
  "sha_ab",
  "abu_sinan",
  "julis",
  "jish",
  "fassuta",
  "mi_ilya",
  "iksal",
  "reineh",
  "tur_an",
  "kabul",
  // Triangle (Central Israel)
  "tayibe",
  "qalansawe",
  "kafr_qasim",
  "baqa_al_gharbiyye",
  "umm_al_fahm",
  "tira",
  "jaljulia",
  "kafr_bara",
  "kafr_qara",
  "ar_ara",
  "jatt",
  "musmus",
  // Negev
  "rahat",
  "tel_sheva",
  "kuseife",
  "lakiya",
  "hura",
  "ar_arat_naqab",
  "segev_shalom",
  "other",
];

// Legacy: keep CITIES export for any places still using text values
export const CITIES = CITY_KEYS;

// CITY_KEYS's fixed order isn't alphabetical in either language — it just
// happens to read as roughly Arabic-alphabetical because that's the order
// it was originally curated in, which means the *same* order renders as
// visibly unsorted Hebrew when city selects display `t[key]` in Hebrew.
// Every city select should look properly alphabetized regardless of which
// language is active, so sort dynamically by the current language's
// translated label instead of relying on the array's own order.
//
// "other" is pinned last regardless of locale — it's a catch-all, not a
// place name, so alphabetizing it in with real city names would be
// misleading no matter where it happened to land.
export function sortCityKeysForDisplay(cityKeys, t, lang) {
  const real = cityKeys.filter((key) => key !== "other");
  real.sort((a, b) => (t[a] || a).localeCompare(t[b] || b, lang));
  return cityKeys.includes("other") ? [...real, "other"] : real;
}