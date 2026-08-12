// Keys are stored in DB; labels are translated in i18n.jsx
export const CITY_KEYS = [
  "jerusalem",
  "nazareth",
  "haifa",
  "jaffa",
  "acre",
  "ramla",
  "lod",
  "tamra",
  "shfaram",
  "umm_al_fahm",
  "baqa_al_gharbiyye",
  "qalansawe",
  "tayibe",
  "kafr_qasim",
  "kafr_kanna",
  "majd_al_krum",
  "sakhnin",
  "arrabe",
  "deir_hanna",
  "yirka",
  "judeide_maker",
  "kafr_yasif",
  "rahat",
  "beer_sheva",
  "tel_aviv",
  "netanya",
  "petah_tikva",
  "rishon_lezion",
  "ashdod",
  "ashkelon",
  "bat_yam",
  "herzliya",
  "raanana",
  "kfar_saba",
  "hod_hasharon",
  "rosh_haayin",
  "modiin_illit",
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