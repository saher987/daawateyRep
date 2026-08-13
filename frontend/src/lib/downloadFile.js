// Every CSV/PNG export in this app (GuestStatsDashboard.jsx's guest-list
// and pending-list exports, Invitees.jsx, MyEvent.jsx,
// InvitationCardEditor.jsx's card download) used the classic browser
// download trick: Blob -> URL.createObjectURL -> <a download> -> click().
// That's silent-no-op in Capacitor's Android WebView — there's no Downloads
// integration and blob: URLs aren't handled the way a real browser handles
// them, so the button visibly did nothing on Android.
//
// Fix: on native, write the file into the app's cache dir via
// @capacitor/filesystem, then hand it to the OS share sheet via
// @capacitor/share — the standard Capacitor pattern for "save a generated
// file," and it also means the user can send the export straight to
// WhatsApp/email/Drive instead of only saving it locally.
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result is "data:<mime>;base64,<data>" —
      // Filesystem.writeFile wants just the base64 payload.
      const result = reader.result;
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function downloadFile(blob, filename) {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const base64Data = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: filename,
    data: base64Data,
    directory: Directory.Cache,
  });
  await Share.share({
    url: written.uri,
    dialogTitle: filename,
  });
}
