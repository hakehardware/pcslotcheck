"use client";

import { IoArrowBack, IoArrowForward } from "react-icons/io5";

interface StepNavProps {
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  currentStepErrorCount: number;
}

export default function StepNav({
  currentStep,
  totalSteps,
  onNext,
  onBack,
  currentStepErrorCount,
}: StepNavProps) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  return (
    <div className="flex items-center justify-between pt-4">
      {!isFirst ? (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-zinc-900"
        >
          <IoArrowBack aria-hidden="true" className="h-4 w-4" />
          Back
        </button>
      ) : (
        <div />
      )}

      {!isLast && (
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-blue-500 outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-zinc-900"
        >
          Next
          {currentStepErrorCount > 0 && (
            <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-xs text-red-300">
              {currentStepErrorCount} {currentStepErrorCount === 1 ? "issue" : "issues"}
            </span>
          )}
          <IoArrowForward aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
