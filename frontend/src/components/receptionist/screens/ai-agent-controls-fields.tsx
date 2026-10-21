"use client";

import {
  voiceAiControls,
  type VoiceAiAgentDraftInput,
} from "@/lib/voice-ai-agents-api";

const inputClass =
  "mt-1 h-9 w-full rounded-[9px] border border-[#D5DAE2] bg-white px-2.5 text-xs text-[#0F172A] focus:border-[#16A34A]";
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function AiAgentControlsFields({
  draft,
  update,
}: {
  draft: VoiceAiAgentDraftInput;
  update: <K extends keyof VoiceAiAgentDraftInput>(
    key: K,
    value: VoiceAiAgentDraftInput[K],
  ) => void;
}) {
  const controls = voiceAiControls(draft);
  return (
    <fieldset className="grid gap-3 rounded-[10px] border border-[#E2E6EA] p-3 sm:col-span-2 sm:grid-cols-2">
      <legend className="px-1 text-xs font-bold text-[#334155]">
        Availability, pilot and call limits
      </legend>
      <label className="text-[11px] font-bold text-[#5B6675]">
        Conversation mode
        <select
          className={inputClass}
          value={controls.runtimeMode}
          onChange={(e) =>
            update(
              "runtimeMode",
              e.target.value as "realtime" | "recorded_turns",
            )
          }
        >
          <option value="recorded_turns">Recorded turns</option>
          <option value="realtime">Live audio with interruption</option>
        </select>
        <span className="mt-1 block text-[10px] font-normal">
          Live audio uses OpenAI Realtime. Server setup and a successful live
          call are required to verify it.
        </span>
      </label>
      <label className="text-[11px] font-bold text-[#5B6675]">
        Agent time zone
        <input
          className={inputClass}
          value={controls.timeZone}
          onChange={(e) => update("timeZone", e.target.value)}
          placeholder="America/New_York"
        />
      </label>
      <div className="flex flex-wrap gap-4 sm:col-span-2">
        <label className="flex gap-2 text-xs">
          <input
            type="checkbox"
            checked={controls.inboundEnabled}
            onChange={(e) => update("inboundEnabled", e.target.checked)}
          />
          Inbound calls
        </label>
        <label className="flex gap-2 text-xs">
          <input
            type="checkbox"
            checked={controls.outboundEnabled}
            onChange={(e) => update("outboundEnabled", e.target.checked)}
          />
          Approved outbound campaigns
        </label>
      </div>
      {(
        [
          ["rolloutPercent", "Inbound pilot traffic (%)", 1, 100],
          ["maxConcurrentCalls", "Maximum concurrent calls", 1, 100],
          ["maxCallSeconds", "Maximum call length (seconds)", 30, 3600],
          ["maxToolCalls", "Maximum tool actions per call", 1, 50],
        ] as const
      ).map(([key, label, min, max]) => (
        <label key={key} className="text-[11px] font-bold text-[#5B6675]">
          {label}
          <input
            className={inputClass}
            type="number"
            min={min}
            max={max}
            step={1}
            value={controls[key]}
            onChange={(e) => update(key, Number(e.target.value))}
          />
        </label>
      ))}
      <p className="m-0 text-[10px] text-[#64748B] sm:col-span-2">
        Use 1–5% for a controlled pilot. Excluded, closed-hours and
        over-capacity calls go to the human routing/follow-up path.
      </p>
      <div className="sm:col-span-2">
        <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#5B6675]">
          Weekly availability
          <button
            type="button"
            className="rounded border px-2 py-1"
            onClick={() =>
              update("weeklyHours", [
                ...controls.weeklyHours,
                { day: 1, opens: "09:00", closes: "17:00" },
              ])
            }
          >
            Add hours
          </button>
        </div>
        {!controls.weeklyHours.length && (
          <p className="text-[10px] text-[#64748B]">
            No weekly restriction. Add opening ranges to restrict the agent.
          </p>
        )}
        {controls.weeklyHours.map((range, index) => (
          <div className="mt-2 flex flex-wrap items-center gap-2" key={index}>
            <label className="text-[10px]">
              Day
              <select
                aria-label={`Day for opening range ${index + 1}`}
                className={inputClass}
                value={range.day}
                onChange={(e) =>
                  update(
                    "weeklyHours",
                    controls.weeklyHours.map((r, i) =>
                      i === index ? { ...r, day: Number(e.target.value) } : r,
                    ),
                  )
                }
              >
                {days.map((day, value) => (
                  <option key={day} value={value}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px]">
              Opens
              <input
                className={inputClass}
                type="time"
                value={range.opens}
                onChange={(e) =>
                  update(
                    "weeklyHours",
                    controls.weeklyHours.map((r, i) =>
                      i === index ? { ...r, opens: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
            <label className="text-[10px]">
              Closes
              <input
                className={inputClass}
                type="time"
                value={range.closes}
                onChange={(e) =>
                  update(
                    "weeklyHours",
                    controls.weeklyHours.map((r, i) =>
                      i === index ? { ...r, closes: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="rounded border px-2 py-1 text-[10px]"
              onClick={() =>
                update(
                  "weeklyHours",
                  controls.weeklyHours.filter((_, i) => i !== index),
                )
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <label className="text-[11px] font-bold text-[#5B6675] sm:col-span-2">
        Closed dates (YYYY-MM-DD, comma separated)
        <input
          className={inputClass}
          value={controls.holidays.join(", ")}
          onChange={(e) =>
            update(
              "holidays",
              e.target.value
                .split(",")
                .map((d) => d.trim())
                .filter(Boolean),
            )
          }
        />
      </label>
    </fieldset>
  );
}
