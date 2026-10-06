interface StartupSplashProps {
  compact?: boolean;
}

export function StartupSplash({ compact = false }: StartupSplashProps) {
  return (
    <div
      aria-label="Bolt DIY workspace"
      className={`flex items-center justify-center bg-[#08070c] ${
        compact ? 'min-h-[40vh] flex-1' : 'min-h-screen w-full'
      }`}
    >
      <div className="flex flex-col items-center gap-3">
        <img src="/logo.svg" alt="Bolt DIY" className="h-10 w-10" />
        <span className="text-sm font-medium tracking-wide text-white/70">Bolt DIY</span>
      </div>
    </div>
  );
}
