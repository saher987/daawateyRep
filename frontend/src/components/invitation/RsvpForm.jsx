import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function RsvpForm({ recipient, onDone }) {
  const [selectedResponse, setSelectedResponse] = useState(null);
  const [guestsCount, setGuestsCount] = useState(String(recipient?.guests_count || 1));
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    await base44.functions.invoke('submitRsvp', {
      recipientId: recipient.id,
      rsvpStatus: selectedResponse,
      guestsCount: Number(guestsCount) || 1,
      message,
    });
    setLoading(false);
    onDone(selectedResponse);
  };

  return (
    <div className="space-y-5">
      <h3 className="text-xl font-semibold text-center">هل ستحضر؟</h3>

      <AnimatePresence mode="wait">
        {!selectedResponse ? (
          <motion.div
            key="choices"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-2 gap-4"
          >
            <Button
              size="lg"
              className="h-16 rounded-xl text-lg gap-2 bg-success hover:bg-success/90 text-success-foreground"
              onClick={() => setSelectedResponse("accepted")}
            >
              <Check className="w-6 h-6" />
              سأحضر
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-16 rounded-xl text-lg gap-2 border-destructive/30 text-destructive hover:bg-destructive/5"
              onClick={() => setSelectedResponse("declined")}
            >
              <X className="w-6 h-6" />
              لن أحضر
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {selectedResponse === "accepted" && (
              <div className="space-y-2">
                <Label className="text-base">عدد الضيوف</Label>
                <Input
                  type="number"
                  min="1"
                  value={guestsCount}
                  onChange={(e) => setGuestsCount(e.target.value)}
                  className="h-14 rounded-xl text-lg text-center"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-base">رسالة (اختياري)</Label>
              <Textarea
                placeholder="أضف رسالة..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="rounded-xl text-base min-h-[80px]"
              />
            </div>
            <div className="flex gap-3">
              <Button
                size="lg"
                className={`flex-1 h-14 rounded-xl text-base gap-2 ${
                  selectedResponse === "accepted"
                    ? "bg-success hover:bg-success/90 text-success-foreground"
                    : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                }`}
                onClick={submit}
                disabled={loading}
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                {selectedResponse === "accepted" ? "تأكيد الحضور" : "تأكيد الاعتذار"}
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="h-14 rounded-xl"
                onClick={() => setSelectedResponse(null)}
              >
                رجوع
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}