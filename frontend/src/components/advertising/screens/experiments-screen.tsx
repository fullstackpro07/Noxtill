"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdvertising, getChip, formatMoney } from "../advertising-context";
import {
  fetchAdExperiments,
  createAdExperiment,
  type AdExperimentItem,
} from "@/lib/ads-api";

export function ExperimentsScreen() {
  const { openDrawer, goToScreen, flash } = useAdvertising();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [expName, setExpName] = useState("");
  const [variantA, setVariantA] = useState("");
  const [variantB, setVariantB] = useState("");
  const [bodyA, setBodyA] = useState("");
  const [bodyB, setBodyB] = useState("");

  const { data: exps = [], isLoading } = useQuery<AdExperimentItem[]>({
    queryKey: ["adExperiments"],
    queryFn: fetchAdExperiments,
  });

  const createMutation = useMutation({
    mutationFn: createAdExperiment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adExperiments"] });
      flash("A/B experiment created and variants queued.");
      setModalOpen(false);
      setExpName("");
      setVariantA("");
      setVariantB("");
      setBodyA("");
      setBodyB("");
    },
    onError: () => {
      flash("Failed to create experiment.");
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expName.trim() || !variantA.trim() || !variantB.trim()) {
      flash("Please fill in experiment name and both variants.");
      return;
    }
    createMutation.mutate({
      name: expName.trim(),
      provider: "meta_ads",
      variantAHeadline: variantA.trim(),
      variantABody: bodyA.trim() || "Creative Variant A text",
      variantBHeadline: variantB.trim(),
      variantBBody: bodyB.trim() || "Creative Variant B text",
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {/* Top Action Bar */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            border: 0,
            background: "#12A150",
            borderRadius: 11,
            padding: "10px 18px",
            fontSize: 12.5,
            fontWeight: 800,
            color: "#fff",
            cursor: "pointer",
            minHeight: 44,
          }}
        >
          New A/B experiment
        </button>
      </div>

      {/* Experiments Table Card */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E6EAF0",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1020 }}>
            <thead>
              <tr style={{ background: "#FAFBFC" }}>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>
                  Experiment
                </th>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Type
                </th>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Target metric
                </th>
                <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Spend
                </th>
                <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Days
                </th>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Variant A
                </th>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Variant B
                </th>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Winner
                </th>
                <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>
                  Statistical confidence
                </th>
                <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {exps.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: "40px 20px", textAlign: "center", color: "#667085" }}>
                    No A/B experiments running yet. Create one above to test creative hooks and variants.
                  </td>
                </tr>
              ) : (
                exps.map((x) => {
                  const confChip = getChip(x.confidence);
                  return (
                    <tr
                      key={x.id}
                      onClick={() => openDrawer("exp", { x })}
                      style={{ borderTop: "1px solid #F2F4F7", cursor: "pointer" }}
                    >
                      <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>
                        {x.name}
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "#667085" }}>{x.type}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467" }}>{x.metric}</td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "#101828", textAlign: "right" }}>
                        {formatMoney(x.spend)}
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>
                        {x.days}d
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "#101828" }}>
                        <strong>{x.variantA}</strong> ({x.valA})
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "#101828" }}>
                        <strong>{x.variantB}</strong> ({x.valB})
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 800, color: x.done ? "#0E8442" : "#B54708" }}>
                        {x.winner}
                      </td>
                      <td style={{ padding: 12 }}>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            padding: "3px 9px",
                            borderRadius: 20,
                            background: confChip.bg,
                            color: confChip.fg,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {x.confidence}
                        </span>
                      </td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDrawer("exp", { x });
                          }}
                          style={{
                            border: "1px solid #E6EAF0",
                            background: "#fff",
                            borderRadius: 9,
                            padding: "7px 12px",
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: "#344054",
                            cursor: "pointer",
                            minHeight: 38,
                          }}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>
          Experiments require statistically significant sample sizes before concluding. Tests that have not accrued enough conversions remain in &quot;Too early&quot; status.
        </div>
      </div>

      {/* New Experiment Modal */}
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,27,42,.42)",
            zIndex: 90,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 18,
              width: 520,
              maxWidth: "100%",
              boxShadow: "0 30px 80px rgba(10,27,42,.32)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "17px 20px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A" }}>
                Create A/B Experiment
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                style={{ border: 0, background: "transparent", cursor: "pointer", color: "#667085" }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: "17px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#98A2B3", marginBottom: 5 }}>
                  Experiment Title
                </label>
                <input
                  type="text"
                  value={expName}
                  onChange={(e) => setExpName(e.target.value)}
                  placeholder="e.g. Hero Ad — Hook A vs Hook B"
                  style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 10, padding: 10, fontSize: 13 }}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#0E8442", marginBottom: 5 }}>
                    Variant A Headline
                  </label>
                  <input
                    type="text"
                    value={variantA}
                    onChange={(e) => setVariantA(e.target.value)}
                    placeholder="e.g. Premium Sound"
                    style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 10, padding: 10, fontSize: 13 }}
                    required
                  />
                  <textarea
                    value={bodyA}
                    onChange={(e) => setBodyA(e.target.value)}
                    placeholder="Variant A copy"
                    rows={2}
                    style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 10, padding: 10, fontSize: 12, marginTop: 6 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#3538CD", marginBottom: 5 }}>
                    Variant B Headline
                  </label>
                  <input
                    type="text"
                    value={variantB}
                    onChange={(e) => setVariantB(e.target.value)}
                    placeholder="e.g. Wireless Freedom"
                    style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 10, padding: 10, fontSize: 13 }}
                    required
                  />
                  <textarea
                    value={bodyB}
                    onChange={(e) => setBodyB(e.target.value)}
                    placeholder="Variant B copy"
                    rows={2}
                    style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 10, padding: 10, fontSize: 12, marginTop: 6 }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: 10, padding: "10px 16px", fontSize: 12.5, fontWeight: 600, color: "#344054", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  style={{ border: 0, background: "#12A150", borderRadius: 10, padding: "10px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer" }}
                >
                  {createMutation.isPending ? "Creating..." : "Launch Experiment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
