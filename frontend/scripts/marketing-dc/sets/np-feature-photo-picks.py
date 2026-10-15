# page -> list per design <img> (document order): library id "L<n>" to use, or None to keep the current pick.
# Built module by module from the existing Noxtill picture library (scratchpad lib*.png sheets).
M = {
 # ── AI Phone Receptionist ──
 "ai-call-answering": [("L72", "Noxtill AI answering a call on the business phone"), ("L24", "Receptionist with a headset beside Noxtill AI call screens"), ("L195", "HVAC technician servicing an outdoor AC unit")],
 "missed-call-recovery": [("L106", "Home services technician in front of his work van"), ("L194", "Text follow-up to a caller who needs an AC repair"), ("L83", "Plumber with his tools beside the service van")],
 "call-transfer-routing": [("L38", "Incoming call routed to the right team with Noxtill"), ("L141", "Property manager with a client, shown in Noxtill")],
 "auto-dialer-power-dialer": [("L163", "Pest control technician treating a home's perimeter"), ("L239", "Account rep on a follow-up call")],
 "ivr-call-menus": [("L10", "Voice assistant greeting callers"), ("L231", "Technician on site while the office routes calls")],
 "call-analytics": [("L29", "Call and business analytics on a Noxtill laptop dashboard"), (None, "")],
 # ── Customers (CRM) ──
 "lead-management": [("L142", "Noxtill dashboard with new inquiries from every channel"), ("L183", "Landscaper trimming a customer's hedge")],
 "sales-pipeline": [(None, ""), (None, "")],
 "customer-360": [("L233", "Stylist washing a client's hair in the salon"), ("L148", "Shop owner checking customer records on a tablet")],
 "follow-ups-reminders": [("L150", "Owner sending a WhatsApp reminder from Noxtill"), (None, "")],
 "segmentation": [("L32", "Marketing audiences and channels in Noxtill"), (None, "")],
 "loyalty-memberships": [("L116", "A regular's latte at the café counter"), (None, "")],
 # ── Bookings ──
 "online-booking": [("L57", "Scan-to-book QR stand on the counter"), (None, "")],
 "appointment-calendar": [("L232", "Salon stations ready for the day's appointments"), ("L37", "Noxtill appointment calendar for the team")],
 "staff-availability": [(None, ""), ("L34", "Staff calendar and booking screens in Noxtill"), (None, "")],
 "automated-reminders": [(None, ""), ("L274", "Booking, reminder sent, confirmed and completed"), ("L155", "Client receiving her appointment reminder on WhatsApp")],
 "rescheduling": [("L192", "Customer moving a booking in a chat"), (None, "")],
 "booking-management": [("L41", "Bookings & appointments in Noxtill"), ("L260", "Guests dining at a busy restaurant")],
 # ── Unified Inbox ──
 "whatsapp-inbox": [(None, ""), ("L136", "WhatsApp open on a business phone")],
 "sms-inbox": [("L231", "Technician texting the customer from site via Noxtill"), ("L105", "Heating and plumbing technician at work")],
 "email-inbox": [("L8", "Shared conversations in the Noxtill Unified Inbox"), ("L93", "Online store packing an order in a Noxtill box")],
 "instagram-messenger": [("L217", "Clothing boutique interior"), ("L5", "Messages from every channel in one Noxtill inbox"), ("L137", "Boutique customer with her shopping bags")],
 "ai-reply-drafting": [("L23", "Noxtill AI drafting replies in the inbox"), ("L40", "Unified Inbox on a laptop")],
 "team-assignment": [("L161", "Pet supply shop shelves"), (None, "")],
 # ── Automations & Workflows ──
 "ai-agents-workflows": [("L31", "Noxtill automations turning messages into tasks"), ("L195", "HVAC technician working on an AC unit")],
 "triggers-actions": [("L22", "Workflow builder with triggers and actions in Noxtill"), ("L108", "Landscaping crew with mower and branded truck")],
 "scheduled-workflows": [("L221", "Clock face for scheduled overnight runs"), (None, "")],
 "webhook-automation": [("L196", "Fitness studio class reminder in Noxtill"), ("L65", "Webhook payload and event log")],
 "approval-workflows": [(None, ""), (None, "")],
 # ── SEO Autopilot ──
 "seo-audits": [("L30", "SEO Autopilot audit on a laptop"), (None, "")],
 "keyword-tracking": [(None, ""), (None, "")],
 "content-optimization": [(None, ""), (None, "")],
 "technical-seo": [("L191", "Clinic reception of the practice that launched a new site"), (None, "")],
 "local-seo": [(None, ""), ("L33", "Business listings and map locations in Noxtill"), ("L279", "Support Local Business chalkboard outside a shop")],
 "seo-performance": [(None, ""), (None, "")],
 # ── Reviews & Reputation ──
 "review-management": [("L44", "Reviews & reputation dashboard in Noxtill"), ("L189", "Clinician with a young patient")],
 "review-requests": [("L151", "Customer receiving a review request on WhatsApp"), (None, "")],
 "ai-review-replies": [(None, ""), ("L264", "AI-drafted reply to a Google review")],
 "reputation-monitoring": [("L152", "Recent review activity across sources"), ("L265", "Auto shop technician with today's appointments")],
 "review-analytics": [(None, ""), ("L183", "Lawn care worker trimming a hedge")],
 "customer-feedback": [(None, ""), ("L153", "Good experiences go further"), (None, "")],
 # ── Fast Sale (POS) ──
 "quick-checkout": [(None, ""), ("L66", "Noxtill point of sale with card terminal"), ("L36", "Customer paying by card at a café counter")],
 "barcode-scanning": [(None, ""), ("L133", "Shop owner scanning a product")],
 "payment-methods": [(None, ""), ("L222", "Customer paying by card at a store counter"), (None, "")],
 "receipts-invoices": [("L223", "Noxtill sale with receipt printer and scanner"), ("L110", "Electrician at a customer's panel")],
 "discounts-promotions": [(None, ""), (None, "")],
 "sales-history": [("L39", "Sales and transactions on the Noxtill register"), (None, "")],
 # ── Field Service ──
 "work-orders": [(None, ""), (None, ""), ("L188", "Technician and homeowner after the job is signed off")],
 "dispatch-board": [("L20", "Dispatch map with technician routes"), ("L184", "Technician checking his next job on the phone")],
 "technician-scheduling": [(None, ""), ("L187", "Technician checking his schedule on the phone"), (None, "")],
 "service-calendar": [(None, ""), ("L164", "Field service activity: inquiry, inspection, completed, invoiced"), (None, "")],
}
# hand-designed pages (authored/features/*.js): old src -> library id
A = {
 "job-tracking.js": [("np/features/pexels-35290669-w1600.jpeg", "L231", "Technician on site while the office sees real-time updates")],
 "business-simulator.js": [("np/features/pexels-9034719-w1600.jpeg", "L147", "Profit overview in Noxtill")],
 "ai-powered-insights.js": [("np/features/pexels-36733313-w1600.jpeg", "L64", "AI Insights dashboard on a laptop")],
 "intelligence-alerts.js": [("np/features/pexels-4473496-w1600.jpeg", "L246", "Noxtill AI insight notification on a phone")],
 "receipt-invoice-scan.js": [("np/features/pexels-3570241-w1600.jpeg", "L25", "Scanning a paper receipt with a phone")],
 "product-digitization.js": [("np/features/pexels-3906984-w1600.jpeg", "L39", "Products ready to sell on the Noxtill register")],
 "inventory-from-photos.js": [("np/features/pexels-8475203-w1600.jpeg", "L216", "Stock check in the warehouse on a tablet")],
 "ai-powered-operations.js": [("np/features/pexels-5409672-w2000.jpeg", "L130", "Owner running the online store from Noxtill")],
 "automated-fulfillment.js": [("np/features/pexels-5239814-w1600.jpeg", "L129", "Order shipped, out for delivery and delivered")],
 "smart-inventory.js": [("np/features/pexels-8475204-w1600.jpeg", "L53", "Inventory overview with stock cover")],
}
