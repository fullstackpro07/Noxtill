"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, Download, Share2, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  MARKETING_ASSET_FORMATS,
  MARKETING_ASSET_FORMAT_LABELS,
  MARKETING_ASSET_TEMPLATES,
  MARKETING_ASSET_CONTENT_BLOCKS,
  MARKETING_ASSET_CONTENT_BLOCK_LABELS,
  uploadMarketingKitBackground,
  generateMarketingKit,
  type MarketingAssetFormat,
  type MarketingAssetTemplate,
  type MarketingAssetContentBlock,
} from "@/lib/marketing-kit-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function MarketingAssetsPanel({ businessName }: { businessName: string }) {
  const [format, setFormat] = useState<MarketingAssetFormat>("a5_poster");
  const [template, setTemplate] = useState<MarketingAssetTemplate>("classic");
  const [contentBlocks, setContentBlocks] = useState<MarketingAssetContentBlock[]>(["logo", "business_name", "tagline", "qr_code"]);
  const [tagline, setTagline] = useState("");
  const [backgroundKey, setBackgroundKey] = useState<string | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadMarketingKitBackground(file),
    onSuccess: (result) => {
      setBackgroundKey(result.backgroundKey);
      setBackgroundPreview(result.backgroundUrl);
      toast.success("Background uploaded.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't upload this image."),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      generateMarketingKit({
        format,
        template,
        contentBlocks,
        tagline: contentBlocks.includes("tagline") ? tagline : undefined,
        fileType: format === "ig_story" ? "png" : "pdf",
        backgroundKey: backgroundKey ?? undefined,
      }),
    onSuccess: (result) => {
      setGeneratedUrl(result.url);
      toast.success("Ready to download.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate this — please try again."),
  });

  function toggleBlock(block: MarketingAssetContentBlock) {
    setContentBlocks((prev) => (prev.includes(block) ? prev.filter((b) => b !== block) : [...prev, block]));
  }

  async function handleShare() {
    if (!generatedUrl) return;
    const text = `Check out this for ${businessName}!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: businessName, text, url: generatedUrl });
        return;
      } catch {
        /* user cancelled or share unsupported for this content — fall through to WhatsApp link */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${generatedUrl}`)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Format" value={format} onChange={(e) => setFormat(e.target.value as MarketingAssetFormat)}>
              {MARKETING_ASSET_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {MARKETING_ASSET_FORMAT_LABELS[f]}
                </option>
              ))}
            </Select>
            <Select label="Template" value={template} onChange={(e) => setTemplate(e.target.value as MarketingAssetTemplate)}>
              {MARKETING_ASSET_TEMPLATES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-fg">
              <ListChecks className="h-3.5 w-3.5" aria-hidden />
              Content checklist
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MARKETING_ASSET_CONTENT_BLOCKS.map((block) => {
                const active = contentBlocks.includes(block);
                return (
                  <button
                    key={block}
                    type="button"
                    onClick={() => toggleBlock(block)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active ? "border-primary bg-primary/10 text-primary" : "border-border text-fg-muted hover:bg-surface-2"
                    }`}
                  >
                    {MARKETING_ASSET_CONTENT_BLOCK_LABELS[block]}
                  </button>
                );
              })}
            </div>
          </div>

          {contentBlocks.includes("tagline") && (
            <Input label="Tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Fresh cuts every day" maxLength={120} />
          )}

          <div>
            <p className="mb-1.5 text-sm font-medium text-fg">Background (optional)</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadMutation.mutate(f);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-3">
              {backgroundPreview && (
                // eslint-disable-next-line @next/next/no-img-element -- external S3-signed URL, not a local/optimizable asset
                <img src={backgroundPreview} alt="" className="h-14 w-14 rounded-[var(--radius-sm)] object-cover" />
              )}
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                <Upload className="h-3.5 w-3.5" aria-hidden />
                {uploadMutation.isPending ? "Uploading…" : backgroundKey ? "Replace" : "Upload your own"}
              </Button>
              {backgroundKey && (
                <button
                  type="button"
                  onClick={() => {
                    setBackgroundKey(null);
                    setBackgroundPreview(null);
                  }}
                  className="text-xs text-fg-muted hover:text-fg"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => generateMutation.mutate()} disabled={contentBlocks.length === 0 || generateMutation.isPending}>
              {generateMutation.isPending ? "Generating…" : "Generate"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
          <p className="text-sm font-medium text-fg">Preview</p>
          {generatedUrl ? (
            format === "ig_story" ? (
              // eslint-disable-next-line @next/next/no-img-element -- external S3-signed URL, not a local/optimizable asset
              <img src={generatedUrl} alt="Generated marketing asset" className="max-h-64 rounded-[var(--radius-sm)] border border-border" />
            ) : (
              <a href={generatedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                Open generated file
              </a>
            )
          ) : (
            <p className="py-8 text-xs text-fg-faint">Generate to see a preview here.</p>
          )}
          {generatedUrl && (
            <div className="flex w-full flex-col gap-2">
              <a href={generatedUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="w-full">
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Download
                </Button>
              </a>
              <Button size="sm" className="w-full" onClick={handleShare}>
                <Share2 className="h-3.5 w-3.5" aria-hidden />
                Share on WhatsApp
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
