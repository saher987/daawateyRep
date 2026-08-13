import React, { useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Image, Type, Download, Save, Plus, Trash2, AlignCenter, AlignRight, AlignLeft, Palette
} from "lucide-react";
import html2canvas from "html2canvas";
import { useBackButton } from "@/hooks/useBackButton";
import { downloadFile } from "@/lib/downloadFile";

const FONTS = [
  { value: "font-arabic", label: "عربي (افتراضي)", css: "'Noto Sans Arabic', sans-serif" },
  { value: "font-display", label: "كلاسيكي أنيق", css: "'Playfair Display', serif" },
  { value: "font-mono", label: "مونو", css: "monospace" },
  { value: "font-serif", label: "سيريف", css: "Georgia, serif" },
];

const GRADIENTS = [
  { label: "ذهبي فاخر", value: "linear-gradient(135deg, #1a0a00 0%, #3d1f00 50%, #1a0a00 100%)" },
  { label: "وردي رومانسي", value: "linear-gradient(135deg, #2d0020 0%, #5c1040 50%, #2d0020 100%)" },
  { label: "أزرق ملكي", value: "linear-gradient(135deg, #00072d 0%, #001a6e 50%, #00072d 100%)" },
  { label: "أخضر زمردي", value: "linear-gradient(135deg, #001a0a 0%, #003d1f 50%, #001a0a 100%)" },
  { label: "رمادي راقي", value: "linear-gradient(135deg, #0d0d0d 0%, #2d2d2d 50%, #0d0d0d 100%)" },
  { label: "بنفسجي", value: "linear-gradient(135deg, #1a0033 0%, #3d0066 50%, #1a0033 100%)" },
  { label: "أبيض نظيف", value: "linear-gradient(135deg, #f5f0e8 0%, #fff9f0 50%, #f5f0e8 100%)" },
];

const DEFAULT_TEXTS = [
  { id: 1, text: "بسم الله الرحمن الرحيم", x: 50, y: 12, fontSize: 18, color: "#D4AF37", fontFamily: "'Noto Sans Arabic', sans-serif", align: "center", bold: false },
  { id: 2, text: "يسعدنا دعوتكم لحضور", x: 50, y: 30, fontSize: 20, color: "#ffffff", fontFamily: "'Noto Sans Arabic', sans-serif", align: "center", bold: false },
  { id: 3, text: "حفل الزفاف", x: 50, y: 46, fontSize: 34, color: "#D4AF37", fontFamily: "'Playfair Display', serif", align: "center", bold: true },
  { id: 4, text: "التاريخ: ١٥ / ٦ / ٢٠٢٥", x: 50, y: 65, fontSize: 16, color: "#ffffff", fontFamily: "'Noto Sans Arabic', sans-serif", align: "center", bold: false },
  { id: 5, text: "قاعة النخيل - الساعة ٧:٠٠ مساءً", x: 50, y: 76, fontSize: 15, color: "#D4AF37", fontFamily: "'Noto Sans Arabic', sans-serif", align: "center", bold: false },
];

// onSaveUrl: optional callback(url) used when there's no event yet (create mode)
export default function InvitationCardEditor({ open, onOpenChange, event, onSaveUrl }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const cardRef = useRef(null);
  const fileInputRef = useRef(null);

  const [bgType, setBgType] = useState("gradient");
  const [bgGradient, setBgGradient] = useState(GRADIENTS[0].value);
  const [bgImage, setBgImage] = useState(null);
  const [bgImageUrl, setBgImageUrl] = useState("");
  const [bgOverlayOpacity, setBgOverlayOpacity] = useState(40);
  const [overlayColor, setOverlayColor] = useState("#000000");
  const [texts, setTexts] = useState(DEFAULT_TEXTS);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useBackButton({ isOpen: open, onClose: () => onOpenChange(false) });

  const selectedText = texts.find(t => t.id === selectedTextId);

  const updateText = (id, changes) => {
    setTexts(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
  };

  const addText = () => {
    const newId = Date.now();
    const newText = {
      id: newId, text: "نص جديد", x: 50, y: 50,
      fontSize: 20, color: "#ffffff",
      fontFamily: "'Noto Sans Arabic', sans-serif",
      align: "center", bold: false
    };
    setTexts(prev => [...prev, newText]);
    setSelectedTextId(newId);
  };

  const removeText = (id) => {
    setTexts(prev => prev.filter(t => t.id !== id));
    if (selectedTextId === id) setSelectedTextId(null);
  };

  const handleBgImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setBgImageUrl(file_url);
      setBgImage(file_url);
      setBgType("image");
    } catch {
      toast({ title: "خطأ", description: "فشل رفع الصورة", variant: "destructive" });
    }
    setUploading(false);
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      await downloadFile(blob, `invitation-${event?.title || "card"}.png`);
    } catch {
      toast({ title: "خطأ", description: "فشل تحميل الصورة", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleSaveToEvent = async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2, useCORS: true, allowTaint: true, backgroundColor: null,
      });
      canvas.toBlob(async (blob) => {
        const file = new File([blob], "invitation-card.png", { type: "image/png" });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (onSaveUrl) {
          // Create mode: pass URL back to parent form
          onSaveUrl(file_url);
          toast({ title: "تم الحفظ", description: "سيتم حفظ البطاقة عند إنشاء المناسبة" });
        } else if (event) {
          await base44.entities.Event.update(event.id, { invitation_image_url: file_url });
          queryClient.invalidateQueries({ queryKey: ["event", event.id] });
          toast({ title: "تم الحفظ", description: "تم حفظ بطاقة الدعوة في المناسبة" });
        }
        setSaving(false);
        onOpenChange(false);
      }, "image/png");
    } catch {
      toast({ title: "خطأ", description: "فشل حفظ البطاقة", variant: "destructive" });
      setSaving(false);
    }
  };

  const cardStyle = {
    width: "100%",
    aspectRatio: "9/14",
    position: "relative",
    overflow: "hidden",
    background: bgType === "gradient" ? bgGradient : undefined,
    backgroundImage: bgType === "image" && bgImage ? `url(${bgImage})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    borderRadius: "12px",
    direction: "rtl",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-full max-h-[95vh] overflow-y-auto p-0" dir="rtl">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-xl flex items-center gap-2">
            <Image className="w-5 h-5 text-primary" />
            مصمم بطاقة الدعوة
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col lg:flex-row gap-0">
          {/* Card Preview */}
          <div className="flex-1 p-6 flex flex-col items-center">
            <div className="w-full max-w-xs">
              <div ref={cardRef} style={cardStyle}>
                {/* Overlay */}
                {bgType === "image" && (
                  <div style={{
                    position: "absolute", inset: 0,
                    background: overlayColor,
                    opacity: bgOverlayOpacity / 100,
                    pointerEvents: "none",
                  }} />
                )}

                {/* Decorative borders */}
                <div style={{
                  position: "absolute", inset: 8,
                  border: "1px solid rgba(212,175,55,0.4)",
                  borderRadius: 8, pointerEvents: "none"
                }} />
                <div style={{
                  position: "absolute", inset: 14,
                  border: "1px solid rgba(212,175,55,0.2)",
                  borderRadius: 6, pointerEvents: "none"
                }} />

                {/* Text elements */}
                {texts.map(t => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTextId(t.id)}
                    style={{
                      position: "absolute",
                      top: `${t.y}%`,
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      width: "85%",
                      textAlign: t.align,
                      fontSize: t.fontSize,
                      color: t.color,
                      fontFamily: t.fontFamily,
                      fontWeight: t.bold ? "700" : "400",
                      cursor: "pointer",
                      padding: "2px 4px",
                      borderRadius: 4,
                      outline: selectedTextId === t.id ? "2px dashed rgba(212,175,55,0.8)" : "none",
                      lineHeight: 1.4,
                      whiteSpace: "pre-line",
                      wordBreak: "break-word",
                    }}
                  >
                    {t.text}
                  </div>
                ))}
              </div>
            </div>

            {/* Download/Save buttons */}
            <div className="flex gap-2 mt-4 w-full max-w-xs">
              <Button onClick={handleDownload} disabled={saving} variant="outline" className="flex-1 gap-2 text-sm">
                <Download className="w-4 h-4" />
                تحميل
              </Button>
              <Button onClick={handleSaveToEvent} disabled={saving} className="flex-1 gap-2 text-sm">
                <Save className="w-4 h-4" />
                {saving ? "جاري الحفظ..." : "حفظ في المناسبة"}
              </Button>
            </div>
          </div>

          {/* Controls Panel */}
          <div className="lg:w-80 border-t lg:border-t-0 lg:border-r border-border p-4 space-y-5 overflow-y-auto">

            {/* Background Section */}
            <div>
              <Label className="text-sm font-semibold mb-3 block">الخلفية</Label>
              <div className="flex gap-2 mb-3">
                <Button
                  size="sm"
                  variant={bgType === "gradient" ? "default" : "outline"}
                  onClick={() => setBgType("gradient")}
                  className="flex-1 text-xs"
                >
                  تدرج لوني
                </Button>
                <Button
                  size="sm"
                  variant={bgType === "image" ? "default" : "outline"}
                  onClick={() => setBgType("image")}
                  className="flex-1 text-xs"
                >
                  صورة
                </Button>
              </div>

              {bgType === "gradient" && (
                <div className="grid grid-cols-4 gap-1.5">
                  {GRADIENTS.map(g => (
                    <button
                      key={g.value}
                      onClick={() => setBgGradient(g.value)}
                      title={g.label}
                      className={`w-full aspect-square rounded-lg border-2 transition-all ${bgGradient === g.value ? "border-primary scale-110" : "border-transparent"}`}
                      style={{ background: g.value }}
                    />
                  ))}
                </div>
              )}

              {bgType === "image" && (
                <div className="space-y-3">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgImageUpload} />
                  <Button
                    variant="outline" size="sm"
                    className="w-full gap-2 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Image className="w-4 h-4" />
                    {uploading ? "جاري الرفع..." : "رفع صورة خلفية"}
                  </Button>
                  {bgImage && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">درجة التعتيم: {bgOverlayOpacity}%</Label>
                      <Slider
                        value={[bgOverlayOpacity]}
                        onValueChange={([v]) => setBgOverlayOpacity(v)}
                        min={0} max={90} step={5}
                      />
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">لون التعتيم</Label>
                        <input type="color" value={overlayColor} onChange={e => setOverlayColor(e.target.value)} className="w-8 h-6 rounded cursor-pointer border" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Texts List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">النصوص</Label>
                <Button size="sm" variant="outline" onClick={addText} className="h-7 gap-1 text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  إضافة
                </Button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {texts.map(t => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTextId(t.id)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs truncate transition-colors ${selectedTextId === t.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                  >
                    <Type className="w-3 h-3 flex-shrink-0" />
                    <span className="flex-1 truncate">{t.text}</span>
                    <button
                      onClick={e => { e.stopPropagation(); removeText(t.id); }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Text Editor */}
            {selectedText && (
              <div className="border border-border rounded-xl p-3 space-y-3">
                <Label className="text-sm font-semibold text-primary">تحرير النص المحدد</Label>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">النص</Label>
                  <textarea
                    value={selectedText.text}
                    onChange={e => updateText(selectedText.id, { text: e.target.value })}
                    className="w-full text-sm border border-input rounded-lg p-2 resize-none h-16 bg-background"
                    dir="rtl"
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">الخط</Label>
                  <Select
                    value={selectedText.fontFamily}
                    onValueChange={v => updateText(selectedText.id, { fontFamily: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONTS.map(f => (
                        <SelectItem key={f.value} value={f.css} className="text-xs">{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">حجم الخط: {selectedText.fontSize}px</Label>
                    <Slider
                      value={[selectedText.fontSize]}
                      onValueChange={([v]) => updateText(selectedText.id, { fontSize: v })}
                      min={10} max={60} step={1}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">الموضع العمودي: {selectedText.y}%</Label>
                    <Slider
                      value={[selectedText.y]}
                      onValueChange={([v]) => updateText(selectedText.id, { y: v })}
                      min={5} max={95} step={1}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                    <Label className="text-xs text-muted-foreground">اللون</Label>
                    <input
                      type="color"
                      value={selectedText.color}
                      onChange={e => updateText(selectedText.id, { color: e.target.value })}
                      className="w-8 h-6 rounded border cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {[
                      { align: "right", Icon: AlignRight },
                      { align: "center", Icon: AlignCenter },
                      { align: "left", Icon: AlignLeft },
                    ].map(({ align, Icon }) => (
                      <button
                        key={align}
                        onClick={() => updateText(selectedText.id, { align })}
                        className={`p-1 rounded transition-colors ${selectedText.align === align ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => updateText(selectedText.id, { bold: !selectedText.bold })}
                    className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${selectedText.bold ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    B
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}