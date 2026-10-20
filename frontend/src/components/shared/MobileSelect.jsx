import React, { useMemo, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, Search } from "lucide-react";
import { useBackButton } from "@/hooks/useBackButton";
import { normalizeForSearch } from "@/lib/recipientName";

// Lists longer than this get a search box (e.g. the ~60 cities).
const SEARCH_THRESHOLD = 10;

/**
 * A mobile-first select: the trigger opens a bottom-sheet Drawer.
 *
 * The sheet is capped at 85% of the screen with the option list scrolling
 * inside it — uncapped, a long list (every city) grew taller than the
 * screen, pushing the title and first options off the top with no way to
 * scroll to them.
 */
export default function MobileSelect({ value, onValueChange, options, placeholder = "اختر...", title, className = "" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useBackButton({ isOpen: open, onClose: () => setOpen(false) });

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;
  const searchable = options.length > SEARCH_THRESHOLD;

  const visibleOptions = useMemo(() => {
    const q = normalizeForSearch(query);
    if (!q) return options;
    return options.filter(o => normalizeForSearch(String(o.label)).includes(q));
  }, [options, query]);

  const handleOpenChange = (next) => {
    setOpen(next);
    if (!next) setQuery("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-4 text-base text-foreground shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <span className={`truncate ${value ? "text-foreground" : "text-muted-foreground"}`}>{selectedLabel}</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>

      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent dir="rtl" className="max-h-[85dvh]">
          <DrawerHeader className="text-right shrink-0">
            <DrawerTitle>{title || placeholder}</DrawerTitle>
          </DrawerHeader>
          {searchable && (
            <div className="px-4 pb-2 shrink-0">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="بحث..."
                  className="h-11 w-full rounded-xl border border-input bg-background pr-9 pl-3 text-base focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 space-y-1">
            {visibleOptions.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onValueChange(option.value);
                  handleOpenChange(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-base transition-colors
                  ${value === option.value
                    ? "bg-primary/10 text-primary font-semibold"
                    : "hover:bg-accent text-foreground"
                  }`}
              >
                <span>{option.label}</span>
                {value === option.value && <Check className="w-5 h-5 text-primary" />}
              </button>
            ))}
            {visibleOptions.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">—</p>}
          </div>
          <div className="px-4 pt-2 pb-safe pb-4 shrink-0">
            <DrawerClose asChild>
              <Button variant="outline" className="w-full h-12 rounded-xl text-base">إغلاق</Button>
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
