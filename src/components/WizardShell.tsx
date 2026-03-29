"use client";

import { useMemo } from "react";
import type { ComponentTypeKey } from "@/lib/form-helpers";
import type { StepDef } from "@/lib/wizard-step-config";
import { getStepErrors, getStepErrorCounts } from "@/lib/wizard-step-config";
import type { ValidationError } from "@/lib/validation-engine-contribute";
import StepIndicator from "./StepIndicator";
import StepNav from "./StepNav";
import FormEngine from "./FormEngine";
import ReviewStep from "./ReviewStep";
import ValidationPanelContribute from "./ValidationPanelContribute";
import BoardCanvasEditor from "./BoardCanvasEditor";

interface WizardShellProps {
  steps: StepDef[];
  currentStep: number;
  onStepChange: (step: number) => void;
  schema: object;
  componentType: ComponentTypeKey;
  formData: Record<string, unknown>;
  errors: ValidationError[];
  yamlString: string;
  isValid: boolean;
  filename: string;
  onChange: (path: string, value: unknown) => void;
  onBatchChange: (updates: Array<{ path: string; value: unknown }>) => void;
  onDirectChange: (path: string, value: unknown) => void;
}

export default function WizardShell({
  steps,
  currentStep,
  onStepChange,
  schema,
  componentType,
  formData,
  errors,
  yamlString,
  isValid,
  filename,
  onChange,
  onBatchChange,
  onDirectChange,
}: WizardShellProps) {
  // Clamp step index to valid bounds
  const safeStep = Math.max(0, Math.min(currentStep, steps.length - 1));
  const step = steps[safeStep];

  const stepErrorCounts = useMemo(
    () => getStepErrorCounts(errors, steps),
    [errors, steps],
  );

  const stepErrors = useMemo(
    () => getStepErrors(errors, step),
    [errors, step],
  );

  const fieldFilter = useMemo(
    () => (step.fields.length > 0 ? new Set(step.fields) : undefined),
    [step.fields],
  );

  const hasDimensions =
    typeof formData.length_mm === "number" &&
    formData.length_mm > 0 &&
    typeof formData.width_mm === "number" &&
    formData.width_mm > 0;

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator
        steps={steps}
        currentStep={safeStep}
        onStepClick={onStepChange}
        stepErrorCounts={stepErrorCounts}
      />

      <div className="text-xs text-zinc-500">
        Step {safeStep + 1} of {steps.length} — {step.label}
      </div>

      {/* Step content */}
      {step.isReview ? (
        <ReviewStep
          errors={errors}
          isValid={isValid}
          yamlString={yamlString}
          filename={filename}
        />
      ) : step.isCanvas ? (
        <div className="flex flex-col gap-4">
          {hasDimensions ? (
            <BoardCanvasEditor
              formData={formData}
              onChange={onDirectChange}
            />
          ) : (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-8 text-center text-sm text-zinc-400">
              Enter board dimensions (length_mm and width_mm) in the Board
              Details step before positioning slots.
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <FormEngine
            schema={schema}
            componentType={componentType}
            formData={formData}
            onChange={onChange}
            onBatchChange={onBatchChange}
            fieldFilter={fieldFilter}
          />
          <ValidationPanelContribute
            errors={stepErrors}
            isValid={stepErrors.filter((e) => e.severity === "error").length === 0}
          />
        </div>
      )}

      <StepNav
        currentStep={safeStep}
        totalSteps={steps.length}
        onNext={() => onStepChange(safeStep + 1)}
        onBack={() => onStepChange(safeStep - 1)}
        currentStepErrorCount={stepErrorCounts[safeStep] ?? 0}
      />
    </div>
  );
}
