export function SettingsSectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-xl font-bold text-fg">{title}</h2>
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
    </div>
  );
}
