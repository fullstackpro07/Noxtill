export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="flex h-16 items-center px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary font-display text-sm font-bold text-primary-foreground">
            N
          </div>
          <span className="font-display text-base font-bold text-fg">Noxtill</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 pb-20 pt-4">{children}</main>
    </div>
  );
}
