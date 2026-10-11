"use client";

import { useEffect, useState } from "react";
import { encodeQrApi, type QrInput, type QrResult } from "@/lib/tools-api";
import { Download, Copy, Check, Globe, Wifi, User, MessageSquare, Phone, Mail, FileText } from "lucide-react";

export function QrCodeGeneratorWorkbench() {
  const [qrType, setQrType] = useState<"url" | "text" | "wifi" | "sms" | "phone" | "email" | "vcard">("url");
  const [url, setUrl] = useState("https://noxtill.com");
  const [text, setText] = useState("Scan to learn more about Noxtill Business OS.");
  const [wifiSsid, setWifiSsid] = useState("Guest_Network");
  const [wifiPassword, setWifiPassword] = useState("Welcome2026");
  const [wifiEncryption, setWifiEncryption] = useState<"WPA" | "WEP" | "nopass">("WPA");
  const [wifiHidden, setWifiHidden] = useState(false);

  const [firstName, setFirstName] = useState("Alex");
  const [lastName, setLastName] = useState("Morgan");
  const [org, setOrg] = useState("Noxtill");
  const [title, setTitle] = useState("Director of Growth");
  const [vcardPhone, setVcardPhone] = useState("+15125550190");
  const [vcardEmail, setVcardEmail] = useState("alex@noxtill.com");

  const [phone, setPhone] = useState("+15125550188");
  const [smsMessage, setSmsMessage] = useState("Hi! I would like to book a consultation.");
  const [emailAddress, setEmailAddress] = useState("support@noxtill.com");
  const [emailSubject, setEmailSubject] = useState("Inquiry regarding Noxtill");
  const [emailBody, setEmailBody] = useState("Hello, I am interested in your services.");

  const [ecLevel, setEcLevel] = useState<"L" | "M" | "Q" | "H">("M");
  const [fgColor, setFgColor] = useState("#0A5A44");
  const [bgColor, setBgColor] = useState("#FFFFFF");
  const size = 280;

  const [result, setResult] = useState<QrResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let payload = "";
    if (qrType === "url") payload = url;
    else if (qrType === "text") payload = text;

    const input: QrInput = {
      qrType,
      payload,
      errorCorrection: ecLevel,
      foregroundColor: fgColor,
      backgroundColor: bgColor,
      size,
      wifi: { ssid: wifiSsid, password: wifiPassword, encryption: wifiEncryption, hidden: wifiHidden },
      vcard: { firstName, lastName, org, title, phone: vcardPhone, email: vcardEmail, url: "https://noxtill.com" },
      phone,
      smsMessage,
      emailAddress,
      emailSubject,
      emailBody,
    };

    encodeQrApi(input)
      .then(setResult)
      .catch((err) => console.error(err));
  }, [
    qrType,
    url,
    text,
    wifiSsid,
    wifiPassword,
    wifiEncryption,
    wifiHidden,
    firstName,
    lastName,
    org,
    title,
    vcardPhone,
    vcardEmail,
    phone,
    smsMessage,
    emailAddress,
    emailSubject,
    emailBody,
    ecLevel,
    fgColor,
    bgColor,
    size,
  ]);

  const downloadPng = () => {
    if (!result?.dataUrl) return;
    const a = document.createElement("a");
    a.href = result.dataUrl;
    a.download = `noxtill-qr-${qrType}.png`;
    a.click();
  };

  const downloadSvg = () => {
    if (!result?.svg) return;
    const blob = new Blob([result.svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `noxtill-qr-${qrType}.svg`;
    a.click();
  };

  const copyPayload = () => {
    if (!result?.payload) return;
    navigator.clipboard.writeText(result.payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left: Type Tabs & Fields */}
      <div className="lg:col-span-7 space-y-6">
        {/* Type Selector Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {[
            { id: "url", label: "Website URL", icon: Globe },
            { id: "text", label: "Plain Text", icon: FileText },
            { id: "wifi", label: "Wi-Fi Access", icon: Wifi },
            { id: "vcard", label: "vCard Contact", icon: User },
            { id: "sms", label: "SMS Text", icon: MessageSquare },
            { id: "phone", label: "Phone Call", icon: Phone },
            { id: "email", label: "Email Message", icon: Mail },
          ].map((item) => {
            const Icon = item.icon;
            const active = qrType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setQrType(item.id as typeof qrType)}
                className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                  active
                    ? "bg-[#2FE3A6] text-[#032019] border-[#2FE3A6] shadow-sm font-bold"
                    : "bg-[#032019]/70 text-[#C9DCD2] border-[#2FE3A6]/20 hover:border-[#2FE3A6]/40"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Input Details Container */}
        <div className="rounded-2xl border border-[#2FE3A6]/20 bg-[#032019]/70 p-6 backdrop-blur-sm shadow-xl space-y-4">
          {qrType === "url" && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Destination URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourwebsite.com/menu"
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
              <span className="text-[11px] text-[#7E9F91] mt-1 block">
                HTTPS link that opens automatically when scanned on any mobile camera.
              </span>
            </div>
          )}

          {qrType === "text" && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Plain Text Payload
              </label>
              <textarea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#2FE3A6]"
              />
            </div>
          )}

          {qrType === "wifi" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                  Wi-Fi Network SSID
                </label>
                <input
                  type="text"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                    Password
                  </label>
                  <input
                    type="text"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                    Encryption
                  </label>
                  <select
                    value={wifiEncryption}
                    onChange={(e) => setWifiEncryption(e.target.value as "WPA" | "WEP" | "nopass")}
                    className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white"
                  >
                    <option value="WPA">WPA / WPA2 / WPA3</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">None (Open)</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-[#B8CFC5] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={wifiHidden}
                  onChange={(e) => setWifiHidden(e.target.checked)}
                  className="accent-[#2FE3A6]"
                />
                <span>Hidden Network (SSID not broadcast)</span>
              </label>
            </div>
          )}

          {qrType === "vcard" && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Company</label>
                <input
                  type="text"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Job Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Phone</label>
                <input
                  type="text"
                  value={vcardPhone}
                  onChange={(e) => setVcardPhone(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#8EAEA0] block mb-1">Email</label>
                <input
                  type="email"
                  value={vcardEmail}
                  onChange={(e) => setVcardEmail(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>
          )}

          {qrType === "sms" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                  Recipient Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                  Pre-filled SMS Message
                </label>
                <textarea
                  rows={2}
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>
            </div>
          )}

          {qrType === "phone" && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
            </div>
          )}

          {qrType === "email" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                  Email Recipient
                </label>
                <input
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                  Email Body
                </label>
                <textarea
                  rows={2}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>
            </div>
          )}

          {/* Style Controls (Color & EC Level) */}
          <div className="pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                QR Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
                />
                <span className="text-xs font-mono text-white">{fgColor}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Background
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
                />
                <span className="text-xs font-mono text-white">{bgColor}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9DBBB0] mb-1.5 block">
                Error Correction
              </label>
              <select
                value={ecLevel}
                onChange={(e) => setEcLevel(e.target.value as "L" | "M" | "Q" | "H")}
                className="w-full bg-[#021A14] border border-[#2FE3A6]/25 rounded-xl px-3 py-1.5 text-xs text-white"
              >
                <option value="L">L (7% recovery)</option>
                <option value="M">M (15% recovery)</option>
                <option value="Q">Q (25% recovery)</option>
                <option value="H">H (30% recovery)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Live High-Res QR Preview & Download */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-2xl border border-[#2FE3A6]/30 bg-[#032019]/90 p-6 backdrop-blur-md shadow-2xl flex flex-col items-center text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-[#2EE6B0] mb-4">
            High-Resolution Preview
          </span>

          <div
            className="p-5 rounded-2xl bg-white shadow-xl mb-5 flex items-center justify-center transition-transform hover:scale-105 duration-200"
            style={{ backgroundColor: bgColor }}
          >
            {result?.svg ? (
              <div
                dangerouslySetInnerHTML={{ __html: result.svg }}
                className="w-56 h-56 flex items-center justify-center"
              />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-xs text-gray-400">Generating QR...</div>
            )}
          </div>

          <div className="w-full space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={downloadPng}
                disabled={!result?.dataUrl}
                className="w-full py-2.5 px-4 rounded-xl bg-[#2FE3A6] text-[#032019] text-xs font-bold hover:bg-[#44F5C2] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-4 h-4" /> Download PNG
              </button>

              <button
                type="button"
                onClick={downloadSvg}
                disabled={!result?.svg}
                className="w-full py-2.5 px-4 rounded-xl border border-[#2FE3A6]/30 text-[#2FE3A6] text-xs font-semibold hover:bg-[#2FE3A6]/15 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-4 h-4" /> Download SVG
              </button>
            </div>

            <button
              type="button"
              onClick={copyPayload}
              className="w-full py-2 px-3 rounded-lg border border-white/10 text-xs text-[#9DBBB0] hover:text-white transition-colors flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#2FE3A6]" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Payload Copied" : "Copy Encoded String"}
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 w-full text-left">
            <span className="text-[11px] text-[#7E9F91] block truncate" title={result?.payload}>
              <strong>Payload:</strong> {result?.payload}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
