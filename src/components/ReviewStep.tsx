"use client";

import type { ValidationError } from "@/lib/validation-engine-contribute";
import ValidationPanelContribute from "./ValidationPanelContribute";
import YamlPreviewPanel from "./YamlPreviewPanel";
import DownloadButton from "./DownloadButton";

interface ReviewStepProps {
  errors: ValidationError[];
  isValid: boolean;
  yamlString: string;
  filename: string;
}

export default function ReviewStep({
  errors,
  isValid,
  yamlString,
  filename,
}: ReviewStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <ValidationPanelContribute errors={errors} isValid={isValid} />
      <YamlPreviewPanel yamlString={yamlString} isValid={isValid} />
      <DownloadButton
        yamlString={yamlString}
        filename={filename}
        disabled={!isValid}
      />
    </div>
  );
}
