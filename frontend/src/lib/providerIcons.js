import {
  Camera, Flower2, Sparkles, Scissors, Shirt, Music, Cake, Car, Gem, Mic, Gift, Flame, Utensils, Crown, Palette, Store,
} from "lucide-react";

// The fixed icon set a provider category can pick from (stored as the key
// in provider_categories.icon). Unknown keys fall back to Store.
export const PROVIDER_ICONS = {
  camera: Camera,
  flower: Flower2,
  sparkles: Sparkles,
  scissors: Scissors,
  shirt: Shirt,
  music: Music,
  cake: Cake,
  car: Car,
  gem: Gem,
  mic: Mic,
  gift: Gift,
  flame: Flame,
  utensils: Utensils,
  crown: Crown,
  palette: Palette,
  store: Store,
};

export function providerIcon(key) {
  return PROVIDER_ICONS[key] || Store;
}

// name_ar/name_he, description_ar/description_he: the current language's
// text, falling back to the other one when it's empty.
export function localized(row, field, langCode) {
  const other = langCode === "he" ? "ar" : "he";
  return row?.[`${field}_${langCode}`] || row?.[`${field}_${other}`] || "";
}
