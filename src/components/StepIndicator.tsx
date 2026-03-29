"use client";

import type { StepDef } from "@/lib/wizard-step-config";
import { IoCheckmarkCircle, IoAlertCircle } from "react-icons/io5";

interface StepIndicatorProps {
  steps: StepDef[];
  currentStep: number;
  onStepClick: (step: number) => void;
  stepErrorCounts: number[];
}

export default function StepIndicator({
  steps,
  currentStep,
  onStepClick,
  stepErrorCounts,
}: StepIndicatorProps) {
  return (
    <nav aria-label="Wizard steps" className="flex flex-wrap gap-1">
      {steps.map((step, i) => {
        const isCurrent = i === currentStep;
        const isPast = i < currentStep;
        const errorCount = stepErrorCounts[i] ?? 0;
        const hasErrors = errorCount > 0;

        return (
          <button
            key={step.label}
            type="button"
            aria-current={isCurrent ? "step" : undefined}
            onClick={() => onStepClick(i)}
            className={[
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
              "outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-zinc-900",
              isCurrent
                ? "border border-blue-500 bg-zinc-800 text-zinc-50"
                : isPast
                  ? "border border-zinc-600 bg-zinc-800/50 text-zinc-300 hover:border-zinc-500"
                  : "border border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300",
            ].join(" ")}
          >
            <span className="tabular-nums">{i + 1}.</span>
            <span>{step.label}</span>
            {step.optional && (
              <span className="text-zinc-500">(optional)</span>
            )}
            {isPast && !hasErrors && (
              <IoCheckmarkCircle aria-hidden="true" className="h-3.5 w-3.5 text-green-400" />
            )}
            {hasErrors && (
              <span className="flex items-center gap-0.5 text-red-400">
                <IoAlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
                <span>{errorCount}</span>
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
