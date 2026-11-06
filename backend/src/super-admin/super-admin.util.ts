import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { SUPER_ADMIN_ERROR_CODES } from './super-admin.constants';

export interface PageQuery {
  page?: string;
  pageSize?: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageArgs(q: PageQuery, max = 100) {
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const pageSize = Math.min(
    max,
    Math.max(1, Math.floor(Number(q.pageSize) || 25)),
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AppException(
      SUPER_ADMIN_ERROR_CODES.INVALID,
      `Invalid date: ${value}`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return d;
}

/** Inclusive date range from `from`/`to` query strings; `to` covers the whole day. */
export function dateRange(from?: string, to?: string) {
  const gte = parseDate(from);
  const end = parseDate(to);
  const lte =
    end && /^\d{4}-\d{2}-\d{2}$/.test(to ?? '')
      ? new Date(end.getTime() + 86_399_999)
      : end;
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

export function notFound(what: string) {
  return new AppException(
    SUPER_ADMIN_ERROR_CODES.NOT_FOUND,
    `${what} not found.`,
    HttpStatus.NOT_FOUND,
  );
}

export function badRequest(message: string) {
  return new AppException(
    SUPER_ADMIN_ERROR_CODES.INVALID,
    message,
    HttpStatus.BAD_REQUEST,
  );
}

export function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s =
    v instanceof Date
      ? v.toISOString()
      : typeof v === 'object'
        ? JSON.stringify(v)
        : `${v as string | number | boolean | bigint}`;
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
}

export const num = (v: unknown): number =>
  v == null ? 0 : typeof v === 'bigint' ? Number(v) : Number(v);
