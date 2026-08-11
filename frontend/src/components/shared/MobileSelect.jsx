import React, { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";
import { useBackButton } from "@/hooks/useBackButton";

/**
 * A mobile-first select component:
 * - On mobile: opens a bottom-sheet Drawer
 * - On desktop: falls back to a native <select> styled to match the app
 */
export default function MobileSelect({ value, onValueChange, options, placeholder = "اختر..." }) {
  const [open, setOpen] = useState(false);

  useBackButton({ isOpen: open, onClose: () => setOpen(false) });

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center justify-between rounded-xl border border-input bg-background px-4 text-base text-foreground shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>{selectedLabel}</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent dir="rtl">
          <DrawerHeader className="text-right">
            <DrawerTitle>{placeholder}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-1">
            {options.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-4 rounded-xl text-base transition-colors
                  ${value === option.value
                    ? "bg-primary/10 text-primary font-semibold"
                    : "hover:bg-accent text-foreground"
                  }`}
              >
                <span>{option.label}</span>
                {value === option.value && <Check className="w-5 h-5 text-primary" />}
              </button>
            ))}
          </div>
          <div className="px-4 pb-safe pb-4">
            <DrawerClose asChild>
              <Button variant="outline" className="w-full h-12 rounded-xl text-base">إغلاق</Button>
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}