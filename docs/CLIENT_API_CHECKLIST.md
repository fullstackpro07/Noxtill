# API & Account Access Needed From You

This document lists every outside service your platform connects to, in plain language. For each one, it explains **what it does for your business**, **whether you need to create an account**, and **what to send back to us** once you have it.

You don't need to do all of this at once — items are grouped by priority. Start with **Priority 1**; everything else can be connected later, feature by feature, as you're ready.

> **How to send us credentials safely:** Please don't paste API keys or passwords directly into email or chat. Use a password manager's "share" feature (e.g., 1Password, Bitwarden) or ask us for a secure link to upload them.

---

## Priority 1 — Required for the Core Product to Work

These power the essentials: AI features, sending messages to customers, taking payments, and storing files.

### 1. Anthropic (Claude AI)
- **What it does:** Powers the AI assistant, dashboard insights, and the receipt/invoice "photo scanner" feature.
- **What to do:** Create an account at https://console.anthropic.com, add a payment method, and generate an API key.
- **Send us:** The API key. *(reference: ANTHROPIC_API_KEY)*

### 2. OpenAI
- **What it does:** Converts voice calls to text (for the AI receptionist) and generates images for marketing content.
- **What to do:** Create an account at https://platform.openai.com, add a payment method, and generate an API key.
- **Send us:** The API key. *(reference: OPENAI_API_KEY)*

### 3. Twilio
- **What it does:** Sends SMS text messages and powers phone calls / the AI receptionist.
- **What to do:** Create an account at https://www.twilio.com, buy a phone number, and find your Account SID and Auth Token in the console.
- **Send us:** Account SID, Auth Token, and the phone number you purchased.

### 4. Meta WhatsApp Business (Cloud API)
- **What it does:** Sends WhatsApp messages to your customers (booking reminders, receipts, marketing).
- **What to do:** Set up a WhatsApp Business Account via https://developers.facebook.com — we're happy to walk you through this step together since it has a few moving parts (Meta Business Manager, phone number verification, app review).
- **Send us:** The access token, phone number ID, and app secret from the setup.

### 5. Stripe
- **What it does:** Processes customer payments and subscriptions.
- **What to do:** Create an account at https://dashboard.stripe.com and complete their business verification.
- **Send us:** The Secret Key from your Stripe Dashboard (under Developers → API Keys).

### 6. Amazon Web Services (AWS)
- **What it does:** Securely stores all generated files — invoices, reports, exports — and provides the AI receptionist's voice (Amazon Polly).
- **What to do:** Create an AWS account at https://aws.amazon.com and create an "Access Key" for a dedicated IAM user (we can guide you through the safe way to do this).
- **Send us:** Access Key ID and Secret Access Key.

### 7. Resend
- **What it does:** Sends transactional and marketing emails to your customers.
- **What to do:** Create an account at https://resend.com and verify your sending domain.
- **Send us:** The API key.

---

## Priority 2 — Local SEO & Maps

Needed for the marketing/local-search features (competitor tracking, delivery distance, map search visibility).

### 8. Google Maps Platform
- **What it does:** Looks up business locations, calculates delivery distances, and powers the SEO heatmap.
- **What to do:** Create a project in https://console.cloud.google.com, enable the "Places API," "Geocoding API," and "Distance Matrix API," and generate an API key.
- **Send us:** The API key.

### 9. SerpApi
- **What it does:** Tracks your Google search ranking and local search trends.
- **What to do:** Create an account at https://serpapi.com and pick a plan.
- **Send us:** The API key.

### 10. Google Business Profile
- **What it does:** Lets us manage your Google Business listing (hours, posts, Q&A, reviews) from your dashboard.
- **What to do:** No separate signup needed — you'll just click "Connect Google" inside the app and log into your existing Google Business account.
- **Send us:** Nothing — this is a one-click connection you do yourself in the app.

---

## Priority 3 — Advertising Platforms (only if you plan to run ads through the app)

For each of these, you'll mostly just click "Connect" inside the app and log in with your existing ad account — **you don't need to send us keys for these**, except where noted. List them here so you know what's possible:

- Google Ads
- Meta Ads (Facebook & Instagram)
- Microsoft Advertising (Bing)
- TikTok Ads
- LinkedIn Ads
- Pinterest Ads
- Snapchat Ads
- Amazon Ads
- Reddit Ads

**Action needed from you:** Simply make sure you have an active advertiser account on whichever of these platforms you want to use — the connection itself happens inside the app with a login, not a key you send us.

---

## Priority 4 — Organic Social Media Posting

Same as above — connect with a login inside the app, no keys to send us:

Facebook, Instagram, X (Twitter), LinkedIn, Pinterest, TikTok, YouTube, Threads, Reddit, Tumblr, Snapchat, Telegram, Discord, LINE, WeChat.

**Note on Telegram & Discord:** these two work a little differently — instead of a login, you create a "bot" and give it a name. We can do this together in five minutes when you're ready (Telegram: message @BotFather in the Telegram app; Discord: https://discord.com/developers).

---

## Priority 5 — Business Listings

Connected via login inside the app once you're ready — no keys needed from you:

- Bing Places for Business
- Apple Business Connect
- Yelp for Business

---

## Priority 6 — Accounting (optional)

Only needed if you want invoices to sync automatically with your bookkeeping software.

- **QuickBooks Online** — connect via login inside the app.
- **Xero** — connect via login inside the app.

---

## Priority 7 — E-commerce (optional)

Only needed if you sell products online through Shopify or WooCommerce and want inventory/orders to sync.

- **Shopify** — connect via login inside the app (enter your store name, then authorize).
- **WooCommerce** — in your WordPress admin, go to WooCommerce → Settings → Advanced → REST API, create a new key, and send us the Consumer Key, Consumer Secret, and your store's web address.

---

## Not Yet Available

- **JazzCash** — we've reserved a spot for this regional payment option, but it isn't built yet. No action needed from you right now.

---

## Quick Checklist for Priority 1 (copy this into an email to us)

- [ ] Anthropic API key
- [ ] OpenAI API key
- [ ] Twilio Account SID, Auth Token, phone number
- [ ] WhatsApp access token, phone number ID, app secret
- [ ] Stripe Secret Key
- [ ] AWS Access Key ID + Secret Access Key
- [ ] Resend API key
