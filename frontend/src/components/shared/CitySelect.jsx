import React from "react";
import MobileSelect from "@/components/shared/MobileSelect";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import { CITY_KEYS, sortCityKeysForDisplay } from "@/lib/cities";

// The one city picker used everywhere: MobileSelect's bottom sheet, with
// search, over every CITY_KEYS city in display order. leadingOptions go
// first, e.g. an "all cities" filter or a "no city" choice.
export default function CitySelect({ value, onValueChange, placeholder, leadingOptions = [], className }) {
  const t = useT();
  const { user } = useAuth();
  const options = [
    ...leadingOptions,
    ...sortCityKeysForDisplay(CITY_KEYS, t, user?.preferred_language || "ar").map((key) => ({ value: key, label: t[key] || key })),
  ];
  return <MobileSelect value={value} onValueChange={onValueChange} options={options} placeholder={placeholder} className={className} />;
}
