import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { errorMessage } from "../lib/api";
import { Logo } from "../components/ui";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel — white with brand accents */}
      <div className="relative hidden w-1/2 flex-col justify-between border-r border-slate-200 bg-white p-12 lg:flex">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <span className="text-lg font-bold text-slate-900">KSV Jabbeke</span>
        </div>
        <div>
          <Logo size={96} className="mb-6" />
          <h1 className="text-4xl font-extrabold leading-tight text-slate-900">
            {t("auth.heroPre")}
            <br />
            <span className="text-brand-600">{t("auth.heroClub")}</span>
          </h1>
          <p className="mt-4 max-w-md text-slate-500">{t("auth.heroText")}</p>
        </div>
        <p className="text-sm text-slate-400">
          © {new Date().getFullYear()} KSV Jabbeke · {t("nav.tagline")}
        </p>
      </div>

      {/* Right form */}
      <div className="relative flex w-full flex-col items-center justify-center bg-slate-50 px-6 lg:w-1/2">
        <div className="absolute right-4 top-4">
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo size={40} />
            <span className="text-lg font-bold text-slate-900">KSV Jabbeke</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            {t("auth.welcomeBack")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{t("auth.signInPrompt")}</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="email">
                {t("auth.emailLabel")}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.emailPlaceholder")}
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                {t("auth.passwordLabel")}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {t("auth.signIn")}
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-slate-400">
            {t("auth.accountsByAdmin")}
          </p>
        </div>
      </div>
    </div>
  );
}
