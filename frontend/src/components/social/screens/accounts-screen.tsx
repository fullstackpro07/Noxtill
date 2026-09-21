"use client";

import { useSocial, getChip } from "../social-context";
import { connectSocialAccount } from "@/lib/social-accounts-api";

export function AccountsScreen() {
  const { isOwner, accounts, openDrawer, openModal, flash } = useSocial();

  const handleConnect = async (platformName: string) => {
    try {
      const pfKey = platformName.toLowerCase().replace(/[^a-z]/g, "") as any;
      const res = await connectSocialAccount(pfKey);
      if (res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        flash(`Connected ${platformName}.`);
      }
    } catch {
      flash(`Connecting ${platformName} requires OAuth app credentials.`);
    }
  };

  if (!isOwner) {
    return (
      <div style={{ background: "#fff", border: "1px solid #FDE3B3", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: "#FEF6E7", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#B54708" strokeWidth="2" strokeLinecap="round">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#93370D" }}>Account connections are restricted</div>
        <div style={{ fontSize: 12.5, color: "#B54708", marginTop: 5, maxWidth: "54ch", marginLeft: "auto", marginRight: "auto" }}>
          Social account credentials, channel linking, and OAuth tokens are restricted to the business owner and managers.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Account Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
        {accounts.map((a) => {
          const chip = getChip(a.st);
          const isConnected = a.st === "Connected";
          const needsFix = a.st === "Needs reconnect";
          const notConnected = a.st === "Not connected";
          const caps = [
            { l: "Publishing", ok: a.pub },
            { l: "Comments", ok: a.com },
            { l: "Messages", ok: a.msg },
            { l: "Analytics", ok: a.ana },
            { l: "Monitoring", ok: a.mon },
          ];

          return (
            <div key={a.id} style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, background: a.bg, color: a.fg, fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 38px" }}>
                  {a.init}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#101828" }}>{a.pf}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#98A2B3", marginTop: 2 }}>{a.handle}</span>
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: chip.bg, color: chip.fg, whiteSpace: "nowrap" }}>
                  {a.st}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12, paddingTop: 11, borderTop: "1px solid #F2F4F7" }}>
                <span style={{ fontSize: 11.5, color: "#667085" }}>{a.branch}</span>
                <span style={{ fontSize: 11.5, color: "#98A2B3" }}>Synced {a.sync}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 12 }}>
                {caps.map((c, idx) => (
                  <span key={idx} style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: c.ok ? "#E8F7EE" : "#F2F4F7", color: c.ok ? "#0E8442" : "#98A2B3" }}>
                    {c.l}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 13, paddingTop: 12, borderTop: "1px solid #F2F4F7" }}>
                {needsFix && (
                  <button
                    onClick={() => handleConnect(a.pf)}
                    style={{ flex: 1, border: 0, background: "#B54708", borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
                  >
                    Reconnect
                  </button>
                )}
                {notConnected && (
                  <button
                    onClick={() => handleConnect(a.pf)}
                    style={{ flex: 1, border: 0, background: "#12A150", borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}
                  >
                    Connect
                  </button>
                )}
                {isConnected && (
                  <button
                    onClick={() => openDrawer("account", { a })}
                    style={{ flex: 1, border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 44 }}
                  >
                    Details
                  </button>
                )}
                {isConnected && (
                  <button
                    onClick={() => openModal("disconnect", { a })}
                    style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "10px 13px", fontSize: 12, fontWeight: 700, color: "#667085", cursor: "pointer", minHeight: 44 }}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(() => {
        const needsReconnectAccount = accounts.find((a) => a.st === "Needs reconnect");
        if (!needsReconnectAccount) return null;
        return (
          <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 12, padding: "12px 14px", fontSize: 12, color: "#93370D", lineHeight: 1.55 }}>
            {needsReconnectAccount.pf} publishing is unavailable until the access token is renewed. Comments and analytics still sync — anything that cannot run is shown as unavailable rather than failing silently.
          </div>
        );
      })()}
    </div>
  );
}
