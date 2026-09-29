"use client";

const STEPS = ["Upload", "Describe", "Prompt"] as const;

export default function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav className="flex items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const step = (i + 1) as 1 | 2 | 3;
        const active = step === current;
        const done = step < current;
        return (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`flex items-center gap-2 rounded-full px-3 py-1 font-medium transition-colors ${
                active
                  ? "bg-neutral-100 text-neutral-900"
                  : done
                    ? "bg-neutral-800 text-neutral-200"
                    : "bg-neutral-900 text-neutral-500"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  active
                    ? "bg-neutral-900 text-neutral-100"
                    : "bg-neutral-700 text-neutral-200"
                }`}
              >
                {step}
              </span>
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="text-neutral-600">→</span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
