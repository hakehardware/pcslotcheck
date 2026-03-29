"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ComponentTypeKey } from "@/lib/form-helpers";
import { setNestedValue } from "@/lib/form-helpers";
import { validateFormData } from "@/lib/validation-engine-contribute";
import type { ValidationError } from "@/lib/validation-engine-contribute";
import { serializeToYaml, cleanFormData } from "@/lib/yaml-serializer";
import ComponentTypeSelector from "@/components/ComponentTypeSelector";
import FormEngine from "@/components/FormEngine";
import ValidationPanelContribute from "@/components/ValidationPanelContribute";
import YamlPreviewPanel from "@/components/YamlPreviewPanel";
import DownloadButton from "@/components/DownloadButton";
import BoardCanvasEditor from "@/components/BoardCanvasEditor";

interface ContributeClientProps {
  schemas: Record<ComponentTypeKey, object>;
}

const DEBOUNCE_MS = 300;

export default function ContributeClient({ schemas }: ContributeClientProps) {
  const [selectedType, setSelectedType] = useState<ComponentTypeKey | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [yamlString, setYamlString] = useState("");
  const [isValid, setIsValid] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Run debounced validation + serialization whenever formData or selectedType changes
  useEffect(() => {
    if (!selectedType) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const schema = schemas[selectedType];
      const cleaned = cleanFormData(formData, selectedType);
      const result = validateFormData(cleaned, selectedType, schema);
      setErrors(result.errors);
      setIsValid(result.isValid);
      setYamlString(serializeToYaml(cleaned, selectedType));
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [formData, selectedType, schemas]);

  const handleTypeSelect = useCallback((type: ComponentTypeKey) => {
    setSelectedType(type);
    setFormData({});
    setErrors([]);
    setYamlString("");
    setIsValid(false);
  }, []);

  const handleFieldChange = useCallback((path: string, value: unknown) => {
    setFormData((prev) => setNestedValue(prev, path, value));
  }, []);

  const handleBatchChange = useCallback(
    (updates: Array<{ path: string; value: unknown }>) => {
      setFormData((prev) => {
        let current = prev;
        for (const { path, value } of updates) {
          current = setNestedValue(current, path, value);
        }
        return current;
      });
    },
    [],
  );

  // For top-level array/object replacements (used by BoardCanvasEditor, etc.)
  const handleDirectChange = useCallback((path: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [path]: value }));
  }, []);

  const filename = formData.id ? `${formData.id}.yaml` : "component.yaml";

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-50">
        YAML Generator
      </h1>
      <p className="mb-6 text-sm text-zinc-400">
        Select a component type and fill out the form to generate a
        schema-compliant YAML file for your PR.
      </p>

      <div className="mb-8">
        <ComponentTypeSelector
          selected={selectedType}
          onSelect={handleTypeSelect}
        />
      </div>

      {selectedType && (
        <div className="flex gap-8">
          {/* Left panel: Form (~60%) */}
          <div className="w-3/5 min-w-0 flex flex-col gap-6">
            <FormEngine
              schema={schemas[selectedType]}
              componentType={selectedType}
              formData={formData}
              onChange={handleFieldChange}
              onBatchChange={handleBatchChange}
            />

            {/* Board canvas inline for motherboard */}
            {selectedType === "motherboard" && (
              <BoardCanvasEditor
                formData={formData}
                onChange={handleDirectChange}
              />
            )}
          </div>

          {/* Right panel: YAML preview + validation (~40%) */}
          <div className="w-2/5 min-w-0 flex flex-col gap-4 sticky top-8 self-start">
            <ValidationPanelContribute errors={errors} isValid={isValid} />
            <YamlPreviewPanel yamlString={yamlString} isValid={isValid} />
            <DownloadButton
              yamlString={yamlString}
              filename={filename}
              disabled={!isValid}
            />
          </div>
        </div>
      )}
    </div>
  );
}
