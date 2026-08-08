export interface PdfPageSize {
    width: string;
    height: string;
}
export interface PngViewport {
    width: number;
    height: number;
}
export declare class PdfRendererService {
    renderPdf(html: string, pageSize?: PdfPageSize): Promise<Buffer>;
    renderPng(html: string, viewport: PngViewport): Promise<Buffer>;
}
