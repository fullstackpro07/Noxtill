import "../(app)/app-theme.css";

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg">{children}</div>;
}
