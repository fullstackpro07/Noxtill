import "../(app)/app-theme.css";

export default function CustomerPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-[var(--app-bg)]">{children}</div>;
}
