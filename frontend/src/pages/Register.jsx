// Adapted from the original Base44 app (zaffaf/src/pages/Register.jsx).
// The original's flow was register -> Base44 emails a 6-digit OTP code ->
// user types it in -> Base44 issues an access_token. Firebase's
// createUserWithEmailAndPassword has no equivalent OTP step — it creates
// and signs the account in in one call — so that whole verify-OTP screen
// (and base44.auth.verifyOtp/resendOtp/setToken) doesn't apply here and
// isn't ported. Facebook login is also omitted, same as Login.jsx —  this
// app doesn't wire up that provider. Everything else (layout, Google
// button, confirm-password field) matches the original.
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithPopup,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { translations, usePublicLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import AppleIcon from "@/components/AppleIcon";

export default function Register() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [lang, setLang] = usePublicLanguage();
  const t = translations[lang];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  // Same pattern as Login.jsx: Firebase signs the account in immediately on
  // creation (no separate verification step to wait for), so redirect the
  // moment AuthContext picks that up.
  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, isLoadingAuth, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError(t.authPasswordsNoMatch);
      return;
    }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged -> isAuthenticated -> the effect above navigates.
    } catch (err) {
      setError(err.message || t.authRegistrationFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // Same Credential Manager -> legacy picker fallback as Login.jsx —
        // see that file for why both paths exist.
        let result;
        try {
          result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
        } catch {
          result = await FirebaseAuthentication.signInWithGoogle({
            skipNativeAuth: true,
            useCredentialManager: false,
          });
        }
        const idToken = result.credential?.idToken;
        if (!idToken) throw new Error("Google sign-in returned no idToken");
        await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
      } else {
        await signInWithPopup(auth, new GoogleAuthProvider());
      }
    } catch (err) {
      setError(err.message || t.authGoogleSignInFailed);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleApple = async () => {
    setError("");
    setAppleLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
        const idToken = result.credential?.idToken;
        const rawNonce = result.credential?.nonce;
        if (!idToken) throw new Error("Apple sign-in returned no idToken");
        const provider = new OAuthProvider("apple.com");
        await signInWithCredential(auth, provider.credential({ idToken, rawNonce }));
      } else {
        const provider = new OAuthProvider("apple.com");
        provider.addScope("email");
        provider.addScope("name");
        await signInWithPopup(auth, provider);
      }
    } catch (err) {
      setError(err.message || t.authAppleSignInFailed);
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={UserPlus}
      title={t.authCreateYourAccount}
      subtitle={t.authSignUpSubtitle}
      dir={t.dir}
      lang={lang}
      onLanguageChange={setLang}
      footer={
        <>
          {t.authAlreadyHaveAccount}{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            {t.login}
          </Link>
        </>
      }
    >
      <Button
        type="button"
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-3"
        onClick={handleGoogle}
        disabled={googleLoading || loading || appleLoading}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        {googleLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {t.authConnecting}
          </>
        ) : (
          t.authContinueWithGoogle
        )}
      </Button>

      {Capacitor.getPlatform() !== "android" && (
        <Button
          type="button"
          className="w-full h-12 text-sm font-medium mb-6 bg-black text-white hover:bg-black/90"
          onClick={handleApple}
          disabled={appleLoading || googleLoading || loading}
        >
          <AppleIcon className="w-5 h-5 mr-2" />
          {appleLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t.authConnecting}
            </>
          ) : (
            t.authContinueWithApple
          )}
        </Button>
      )}

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">{t.authOr}</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t.authEmail}</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t.authPassword}</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
              minLength={6}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{t.authConfirmPassword}</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
              minLength={6}
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading || googleLoading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t.authCreatingAccount}
            </>
          ) : (
            t.authCreateAccountBtn
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
