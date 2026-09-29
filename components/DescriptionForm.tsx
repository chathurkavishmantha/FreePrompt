"use client";

import type { SceneDescription, SceneSubject } from "@/lib/types";

const TEXT_FIELDS: {
  key: keyof Pick<
    SceneDescription,
    "summary" | "setting" | "lighting" | "camera" | "vfx" | "colors" | "mood" | "style"
  >;
  label: string;
  rows: number;
}[] = [
  { key: "summary", label: "Summary", rows: 3 },
  { key: "setting", label: "Setting", rows: 2 },
  { key: "lighting", label: "Lighting", rows: 2 },
  { key: "camera", label: "Camera", rows: 2 },
  { key: "vfx", label: "VFX", rows: 2 },
  { key: "colors", label: "Colors", rows: 2 },
  { key: "mood", label: "Mood", rows: 2 },
  { key: "style", label: "Style", rows: 2 },
];

const SUBJECT_FIELDS: { key: keyof SceneSubject; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "appearance", label: "Appearance" },
  { key: "clothing", label: "Clothing" },
  { key: "colors", label: "Colors" },
  { key: "materials", label: "Materials" },
  { key: "glowingDetails", label: "Glowing details" },
  { key: "position", label: "Position" },
];

const EMPTY_SUBJECT: SceneSubject = {
  name: "",
  appearance: "",
  clothing: "",
  colors: "",
  materials: "",
  glowingDetails: "",
  position: "",
};

const labelClass =
  "text-xs font-medium uppercase tracking-wide text-neutral-500";
const inputClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500";

export default function DescriptionForm({
  value,
  onChange,
}: {
  value: SceneDescription;
  onChange: (next: SceneDescription) => void;
}) {
  function setField<K extends keyof SceneDescription>(
    key: K,
    v: SceneDescription[K]
  ) {
    onChange({ ...value, [key]: v });
  }

  function setSubject(index: number, key: keyof SceneSubject, v: string) {
    const subjects = value.subjects.map((s, i) =>
      i === index ? { ...s, [key]: v } : s
    );
    setField("subjects", subjects);
  }

  function addSubject() {
    setField("subjects", [...value.subjects, { ...EMPTY_SUBJECT }]);
  }

  function removeSubject(index: number) {
    setField(
      "subjects",
      value.subjects.filter((_, i) => i !== index)
    );
  }

  function setListItem(
    key: "actions" | "uncertain",
    index: number,
    v: string
  ) {
    const list = value[key].map((item, i) => (i === index ? v : item));
    setField(key, list);
  }

  function addListItem(key: "actions" | "uncertain") {
    setField(key, [...value[key], ""]);
  }

  function removeListItem(key: "actions" | "uncertain", index: number) {
    setField(
      key,
      value[key].filter((_, i) => i !== index)
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Uncertain warning box */}
      <div className="rounded-lg border border-yellow-700/60 bg-yellow-950/40 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-yellow-300">
            ⚠ Uncertain / unverified details
          </h3>
          <button
            type="button"
            onClick={() => addListItem("uncertain")}
            className="rounded-md bg-yellow-800/60 px-2 py-1 text-xs text-yellow-100 hover:bg-yellow-800"
          >
            + Add
          </button>
        </div>
        <p className="mt-1 text-xs text-yellow-500/80">
          Review these — the model was not sure about them.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {value.uncertain.length === 0 && (
            <p className="text-xs text-yellow-600/70">Nothing flagged.</p>
          )}
          {value.uncertain.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={item}
                onChange={(e) => setListItem("uncertain", i, e.target.value)}
                className={`${inputClass} border-yellow-800/60 bg-yellow-950/30`}
              />
              <button
                type="button"
                onClick={() => removeListItem("uncertain", i)}
                className="rounded-md px-2 text-yellow-300 hover:bg-yellow-900/50"
                aria-label="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Scalar text fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        {TEXT_FIELDS.map(({ key, label, rows }) => (
          <label
            key={key}
            className={`flex flex-col gap-1 ${key === "summary" ? "sm:col-span-2" : ""}`}
          >
            <span className={labelClass}>{label}</span>
            <textarea
              value={value[key]}
              rows={rows}
              onChange={(e) => setField(key, e.target.value)}
              className={`${inputClass} resize-y`}
            />
          </label>
        ))}
      </div>

      {/* Subjects */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-200">Subjects</h3>
          <button
            type="button"
            onClick={addSubject}
            className="rounded-md bg-neutral-800 px-3 py-1 text-xs text-neutral-100 hover:bg-neutral-700"
          >
            + Add subject
          </button>
        </div>
        {value.subjects.length === 0 && (
          <p className="text-xs text-neutral-500">No subjects yet.</p>
        )}
        {value.subjects.map((subject, i) => (
          <div
            key={i}
            className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-400">
                Subject {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeSubject(i)}
                className="rounded-md px-2 py-1 text-xs text-red-300 hover:bg-red-900/40"
              >
                Remove
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {SUBJECT_FIELDS.map(({ key, label }) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className={labelClass}>{label}</span>
                  <input
                    value={subject[key]}
                    onChange={(e) => setSubject(i, key, e.target.value)}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Actions */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-200">Actions</h3>
          <button
            type="button"
            onClick={() => addListItem("actions")}
            className="rounded-md bg-neutral-800 px-3 py-1 text-xs text-neutral-100 hover:bg-neutral-700"
          >
            + Add action
          </button>
        </div>
        {value.actions.length === 0 && (
          <p className="text-xs text-neutral-500">No actions yet.</p>
        )}
        {value.actions.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={item}
              onChange={(e) => setListItem("actions", i, e.target.value)}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => removeListItem("actions", i)}
              className="rounded-md px-2 text-neutral-400 hover:bg-neutral-800"
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
