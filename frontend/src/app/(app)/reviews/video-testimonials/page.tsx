"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { VideoTestimonialsPanel } from "@/components/reviews/video-testimonials-panel";

export default function VideoTestimonialsPage() {
  return (
    <SubscreenShell title="Video Testimonials">
      <VideoTestimonialsPanel />
    </SubscreenShell>
  );
}
