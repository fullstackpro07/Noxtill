"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tags, Plus, Trash2, Pencil, ArrowUp, ArrowDown, Combine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  fetchCategoryRevenue,
  mergeCategory,
  reorderCategories,
  updateCategory,
  type LiveCategory,
} from "@/lib/categories-api";

const DONUT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function CategoriesPanel({ currency }: { currency: string }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<LiveCategory | null>(null);
  const [merging, setMerging] = useState<LiveCategory | null>(null);
  const [deleting, setDeleting] = useState<LiveCategory | null>(null);

  const { data: categories, isPending, isError, refetch } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: revenue } = useQuery({ queryKey: ["category-revenue"], queryFn: fetchCategoryRevenue });

  const reorderMutation = useMutation({
    mutationFn: reorderCategories,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reorder categories — please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Category deleted.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this category — please try again."),
  });

  function move(index: number, direction: -1 | 1) {
    if (!categories) return;
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorderMutation.mutate(reordered.map((c, i) => ({ id: c.id, sortOrder: i })));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add category
        </Button>
      </div>

      {revenue && revenue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue by category</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueDonut data={revenue} currency={currency} />
          </CardContent>
        </Card>
      )}

      {isError && <ErrorBanner title="Couldn't load categories" onRetry={() => refetch()} />}

      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}

      {categories && categories.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={Tags} title="No categories yet" description="Organize your catalog into categories." />
          </CardContent>
        </Card>
      )}

      {categories && categories.length > 0 && (
        <div className="flex flex-col gap-2">
          {categories.map((c, i) => (
            <Card key={c.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex flex-col">
                  <button
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label="Move up"
                    className="text-fg-faint hover:text-fg disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    disabled={i === categories.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Move down"
                    className="text-fg-faint hover:text-fg disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{c.name}</p>
                  <p className="text-xs text-fg-muted">{c.productCount} product(s)</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setMerging(c)}>
                    <Combine className="h-3.5 w-3.5" aria-hidden />
                    Merge
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setRenaming(c)} aria-label="Rename">
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(c)} aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CategoryFormDialog open={creating} onClose={() => setCreating(false)} />
      {renaming && <CategoryFormDialog open onClose={() => setRenaming(null)} category={renaming} />}
      {merging && categories && <MergeCategoryDialog category={merging} categories={categories} onClose={() => setMerging(null)} />}

      <Dialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Delete "${deleting.name}"?` : "Delete category"}
        description={deleting && deleting.productCount > 0 ? `${deleting.productCount} product(s) will become uncategorized.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function RevenueDonut({ data, currency }: { data: { categoryId: string; categoryName: string; revenue: number }[]; currency: string }) {
  const total = data.reduce((sum, d) => sum + d.revenue, 0);
  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => (
        <div key={d.categoryId} className="flex items-center gap-2.5 text-sm">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-fg">{d.categoryName}</span>
          <span className="font-medium tabular-nums text-fg">{formatCurrency(d.revenue, currency)}</span>
          <span className="w-10 shrink-0 text-end text-xs tabular-nums text-fg-faint">{total > 0 ? Math.round((d.revenue / total) * 100) : 0}%</span>
        </div>
      ))}
    </div>
  );
}

function CategoryFormDialog({ open, onClose, category }: { open: boolean; onClose: () => void; category?: LiveCategory }) {
  const [name, setName] = useState(category?.name ?? "");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => (category ? updateCategory(category.id, { name }) : createCategory({ name })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(category ? "Category renamed." : "Category added.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this category — please try again."),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={category ? "Rename category" : "Add category"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
    </Dialog>
  );
}

function MergeCategoryDialog({ category, categories, onClose }: { category: LiveCategory; categories: LiveCategory[]; onClose: () => void }) {
  const [targetId, setTargetId] = useState("");
  const queryClient = useQueryClient();
  const candidates = categories.filter((c) => c.id !== category.id);

  const mutation = useMutation({
    mutationFn: () => mergeCategory(category.id, targetId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Moved ${result.movedProductCount} product(s) — "${category.name}" removed.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't merge these categories — please try again."),
  });

  const target = candidates.find((c) => c.id === targetId);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Merge "${category.name}" into…`}
      description={
        target
          ? `${category.productCount} product(s) move into "${target.name}" (currently ${target.productCount}), which will then have ${category.productCount + target.productCount}. "${category.name}" is deleted.`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={!targetId || mutation.isPending}>
            {mutation.isPending ? "Merging…" : "Merge"}
          </Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-fg-muted">No other categories to merge into.</p>
      ) : (
        <Select label="Target category" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="" disabled>
            Select a category…
          </option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}
    </Dialog>
  );
}
