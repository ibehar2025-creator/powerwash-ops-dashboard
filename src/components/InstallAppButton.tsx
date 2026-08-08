import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(() => isStandalone());
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);

  useEffect(() => {
    function capturePrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }
    function handleInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed || (!installPrompt && !isIos)) return null;

  async function install() {
    if (isIos && !installPrompt) {
      setShowIosHelp(true);
      return;
    }
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }

  return (
    <>
      <button type="button" className="icon-button" aria-label="Install The Powerwashing Pros app" title="Install app" onClick={() => void install()}>
        <Download size={17} />
      </button>
      {showIosHelp && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/55 p-4" onClick={() => setShowIosHelp(false)}>
          <section className="w-full max-w-sm rounded-lg bg-white p-5 shadow-soft dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="install-app-title" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">iPhone app</p>
                <h2 id="install-app-title" className="mt-1 text-xl font-bold text-ink dark:text-white">Add to Home Screen</h2>
              </div>
              <button type="button" className="icon-button shrink-0" aria-label="Close installation instructions" onClick={() => setShowIosHelp(false)}><X size={17} /></button>
            </div>
            <ol className="mt-5 space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mist font-bold text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200">1</span><span className="pt-1.5">Open this dashboard in Safari.</span></li>
              <li className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mist text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200"><Share size={16} /></span><span className="pt-1.5">Tap Safari's Share button.</span></li>
              <li className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mist font-bold text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200">3</span><span className="pt-1.5">Choose <strong>Add to Home Screen</strong>, turn on <strong>Open as Web App</strong>, then tap Add.</span></li>
            </ol>
            <button type="button" className="primary-button mt-6 w-full" onClick={() => setShowIosHelp(false)}>Got it</button>
          </section>
        </div>
      )}
    </>
  );
}
