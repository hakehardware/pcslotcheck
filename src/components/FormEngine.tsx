"use client";

import { useEffect, useCallback } from "react";
import type { ComponentTypeKey } from "@/lib/form-helpers";
import { toKebabCase, SCHEMA_VERSIONS } from "@/lib/form-helpers";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FormEngineProps {
  schema: object;
  componentType: ComponentTypeKey;
  formData: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
  onBatchChange: (updates: Array<{ path: string; value: unknown }>) => void;
  fieldFilter?: Set<string>;
}

interface SchemaProperty {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  description?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  items?: SchemaProperty | { $ref?: string };
  oneOf?: SchemaProperty[];
  $ref?: string;
  additionalProperties?: boolean;
  minItems?: number;
  format?: string;
}

interface JsonSchema {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  definitions?: Record<string, SchemaProperty>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Fields auto-managed by the engine -- hidden or read-only */
const AUTO_FIELDS = new Set(["id", "schema_version", "type"]);

/** Component type to `type` field value mapping */
const TYPE_FIELD_VALUES: Record<ComponentTypeKey, string> = {
  motherboard: "motherboard",
  cpu: "cpu",
  gpu: "gpu",
  nvme: "nvme",
  ram: "ram",
  sata_ssd: "sata_ssd",
  sata_hdd: "sata_hdd",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const idx = Number(key);
      if (Number.isNaN(idx)) return undefined;
      current = current[idx];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}


/** Resolve a $ref like "#/definitions/M2Slot" to the actual schema definition */
function resolveRef(ref: string, rootSchema: JsonSchema): SchemaProperty | undefined {
  const parts = ref.replace(/^#\//, "").split("/");
  let current: unknown = rootSchema;
  for (const part of parts) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current as SchemaProperty | undefined;
}

/** Resolve a property, following $ref if present */
function resolveProperty(
  prop: SchemaProperty,
  rootSchema: JsonSchema,
): SchemaProperty {
  if (prop.$ref) {
    const resolved = resolveRef(prop.$ref, rootSchema);
    return resolved ?? prop;
  }
  return prop;
}

/** Resolve items schema, following $ref if present */
function resolveItems(
  items: SchemaProperty | { $ref?: string } | undefined,
  rootSchema: JsonSchema,
): SchemaProperty | undefined {
  if (!items) return undefined;
  if ("$ref" in items && items.$ref) {
    return resolveRef(items.$ref, rootSchema);
  }
  return items as SchemaProperty;
}

/** Check if a property is a oneOf: [array, null] pattern */
function isOptionalArrayPattern(prop: SchemaProperty): {
  isOptional: boolean;
  arraySchema: SchemaProperty | undefined;
} {
  if (!prop.oneOf || prop.oneOf.length !== 2) {
    return { isOptional: false, arraySchema: undefined };
  }
  const arrayEntry = prop.oneOf.find((s) => s.type === "array");
  const nullEntry = prop.oneOf.find((s) => s.type === "null");
  if (arrayEntry && nullEntry) {
    return { isOptional: true, arraySchema: arrayEntry };
  }
  return { isOptional: false, arraySchema: undefined };
}

/** Create a default empty item for an array based on its items schema */
function createDefaultItem(
  itemSchema: SchemaProperty | undefined,
  rootSchema: JsonSchema,
): unknown {
  if (!itemSchema) return {};
  const resolved = resolveProperty(itemSchema as SchemaProperty, rootSchema);
  if (resolved.type === "object" && resolved.properties) {
    const obj: Record<string, unknown> = {};
    for (const [key, propDef] of Object.entries(resolved.properties)) {
      const resolvedProp = resolveProperty(propDef, rootSchema);
      if (resolvedProp.type === "string") {
        obj[key] = resolvedProp.const !== undefined ? resolvedProp.const : "";
      } else if (resolvedProp.type === "integer" || resolvedProp.type === "number") {
        obj[key] = resolvedProp.minimum ?? 0;
      } else if (resolvedProp.type === "boolean") {
        obj[key] = false;
      } else if (resolvedProp.type === "array") {
        obj[key] = [];
      } else {
        const optionalArr = isOptionalArrayPattern(resolvedProp);
        if (optionalArr.isOptional) {
          obj[key] = null;
        } else if (resolvedProp.type === "object") {
          obj[key] = createDefaultItem(resolvedProp, rootSchema);
        } else {
          // oneOf with string | null (like disabled_by)
          if (resolvedProp.oneOf) {
            const hasNull = resolvedProp.oneOf.some((s) => s.type === "null");
            if (hasNull) {
              obj[key] = null;
            } else {
              obj[key] = "";
            }
          } else {
            obj[key] = null;
          }
        }
      }
    }
    return obj;
  }
  if (resolved.type === "string") return "";
  if (resolved.type === "number" || resolved.type === "integer") return 0;
  if (resolved.type === "boolean") return false;
  return {};
}

/** Format a field key into a human-readable label */
function formatLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** Toggle switch for boolean fields */
function ToggleSwitch({
  checked,
  onChange: onToggle,
  id: inputId,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  id: string;
  label: string;
}) {
  return (
    <button
      id={inputId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onToggle(!checked)}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-blue-600" : "bg-zinc-600",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}


/* ------------------------------------------------------------------ */
/*  Field Renderers                                                    */
/* ------------------------------------------------------------------ */

function StringField({
  path,
  value,
  onChange,
  required,
  readOnly,
  description,
}: {
  path: string;
  value: string;
  onChange: (path: string, value: unknown) => void;
  required: boolean;
  readOnly?: boolean;
  description?: string;
}) {
  const fieldId = `field-${path}`;
  const label = formatLabel(path.split(".").pop() ?? path);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm font-medium text-zinc-300">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      <input
        id={fieldId}
        type="text"
        value={value ?? ""}
        readOnly={readOnly}
        onChange={(e) => onChange(path, e.target.value)}
        className={[
          "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50",
          "outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
          readOnly ? "cursor-not-allowed opacity-60" : "",
        ].join(" ")}
        aria-required={required}
      />
      {description && (
        <p className="text-xs text-zinc-500">{description}</p>
      )}
    </div>
  );
}

function NumberField({
  path,
  value,
  onChange,
  required,
  minimum,
  maximum,
  description,
  isInteger,
}: {
  path: string;
  value: number | string;
  onChange: (path: string, value: unknown) => void;
  required: boolean;
  minimum?: number;
  maximum?: number;
  description?: string;
  isInteger?: boolean;
}) {
  const fieldId = `field-${path}`;
  const label = formatLabel(path.split(".").pop() ?? path);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm font-medium text-zinc-300">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      <input
        id={fieldId}
        type="number"
        value={value ?? ""}
        min={minimum}
        max={maximum}
        step={isInteger ? 1 : "any"}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(path, "");
            return;
          }
          const parsed = isInteger ? parseInt(raw, 10) : parseFloat(raw);
          onChange(path, Number.isNaN(parsed) ? "" : parsed);
        }}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        aria-required={required}
      />
      {description && (
        <p className="text-xs text-zinc-500">{description}</p>
      )}
    </div>
  );
}

function EnumField({
  path,
  value,
  options,
  onChange,
  required,
  description,
}: {
  path: string;
  value: string;
  options: unknown[];
  onChange: (path: string, value: unknown) => void;
  required: boolean;
  description?: string;
}) {
  const fieldId = `field-${path}`;
  const label = formatLabel(path.split(".").pop() ?? path);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm font-medium text-zinc-300">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      <select
        id={fieldId}
        value={value ?? ""}
        onChange={(e) => onChange(path, e.target.value)}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        aria-required={required}
      >
        <option value="">-- Select --</option>
        {options.map((opt) => (
          <option key={String(opt)} value={String(opt)}>
            {String(opt)}
          </option>
        ))}
      </select>
      {description && (
        <p className="text-xs text-zinc-500">{description}</p>
      )}
    </div>
  );
}

function BooleanField({
  path,
  value,
  onChange,
  required,
  description,
}: {
  path: string;
  value: boolean;
  onChange: (path: string, value: unknown) => void;
  required: boolean;
  description?: string;
}) {
  const label = formatLabel(path.split(".").pop() ?? path);
  const fieldId = `field-${path}`;
  return (
    <div className="flex items-center gap-3">
      <ToggleSwitch
        id={fieldId}
        checked={!!value}
        onChange={(val) => onChange(path, val)}
        label={label}
      />
      <label htmlFor={fieldId} className="text-sm font-medium text-zinc-300">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {description && (
        <p className="text-xs text-zinc-500">{description}</p>
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/*  Optional Section (oneOf: [array, null])                            */
/* ------------------------------------------------------------------ */

function OptionalSection({
  path,
  label,
  enabled,
  onToggle,
  children,
}: {
  path: string;
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
}) {
  const fieldId = `toggle-${path}`;
  return (
    <fieldset className="rounded-lg border border-zinc-700 p-4">
      <legend className="flex items-center gap-3 px-2 text-sm font-medium text-zinc-300">
        <ToggleSwitch
          id={fieldId}
          checked={enabled}
          onChange={onToggle}
          label={`Enable ${label}`}
        />
        <span>{label}</span>
        <span className="text-xs text-zinc-500">(optional)</span>
      </legend>
      {enabled && <div className="mt-3 flex flex-col gap-4">{children}</div>}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/*  Array Field                                                        */
/* ------------------------------------------------------------------ */

function ArrayField({
  path,
  items,
  itemSchema,
  rootSchema,
  onChange,
  requiredFields,
}: {
  path: string;
  items: unknown[];
  itemSchema: SchemaProperty | undefined;
  rootSchema: JsonSchema;
  onChange: (path: string, value: unknown) => void;
  requiredFields: string[];
}) {
  const label = formatLabel(path.split(".").pop() ?? path);
  const resolvedItemSchema = itemSchema
    ? resolveProperty(itemSchema as SchemaProperty, rootSchema)
    : undefined;

  const handleAdd = () => {
    const newItem = createDefaultItem(resolvedItemSchema, rootSchema);
    onChange(path, [...(items ?? []), newItem]);
  };

  const handleRemove = (index: number) => {
    const updated = [...(items ?? [])];
    updated.splice(index, 1);
    onChange(path, updated);
  };

  return (
    <fieldset className="rounded-lg border border-zinc-700 p-4">
      <legend className="px-2 text-sm font-medium text-zinc-300">
        {label}
        {requiredFields.includes(path.split(".").pop() ?? "") && (
          <span className="ml-1 text-red-400">*</span>
        )}
        <span className="ml-2 text-xs text-zinc-500">
          ({(items ?? []).length} item{(items ?? []).length !== 1 ? "s" : ""})
        </span>
      </legend>
      <div className="mt-3 flex flex-col gap-3">
        {(items ?? []).map((item, index) => (
          <div
            key={index}
            className="relative rounded-md border border-zinc-700/50 bg-zinc-800/50 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">
                {label} #{index + 1}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-400/10 hover:text-red-300"
                aria-label={`Remove ${label} ${index + 1}`}
              >
                Remove
              </button>
            </div>
            {resolvedItemSchema?.type === "object" && resolvedItemSchema.properties ? (
              <ObjectFields
                path={`${path}.${index}`}
                schema={resolvedItemSchema}
                rootSchema={rootSchema}
                formData={item as Record<string, unknown>}
                onChange={onChange}
              />
            ) : (
              <SchemaField
                path={`${path}.${index}`}
                schema={resolvedItemSchema ?? { type: "string" }}
                rootSchema={rootSchema}
                value={item}
                onChange={onChange}
                required={false}
              />
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={handleAdd}
          className="self-start rounded-md border border-dashed border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
        >
          + Add {label.replace(/s$/, "")}
        </button>
      </div>
    </fieldset>
  );
}


/* ------------------------------------------------------------------ */
/*  Generic Schema Field Renderer                                      */
/* ------------------------------------------------------------------ */

function SchemaField({
  path,
  schema,
  rootSchema,
  value,
  onChange,
  required,
}: {
  path: string;
  schema: SchemaProperty;
  rootSchema: JsonSchema;
  value: unknown;
  onChange: (path: string, value: unknown) => void;
  required: boolean;
}) {
  const resolved = resolveProperty(schema, rootSchema);

  // oneOf: [array, null] pattern -- optional section with toggle
  const optionalArr = isOptionalArrayPattern(resolved);
  if (optionalArr.isOptional && optionalArr.arraySchema) {
    const isEnabled = value !== null && value !== undefined;
    const arrayItems = isEnabled ? (value as unknown[]) : [];
    const itemSchema = resolveItems(optionalArr.arraySchema.items, rootSchema);
    const fieldLabel = formatLabel(path.split(".").pop() ?? path);

    return (
      <OptionalSection
        path={path}
        label={fieldLabel}
        enabled={isEnabled}
        onToggle={(enabled) => {
          onChange(path, enabled ? [] : null);
        }}
      >
        <ArrayField
          path={path}
          items={arrayItems}
          itemSchema={itemSchema}
          rootSchema={rootSchema}
          onChange={onChange}
          requiredFields={[]}
        />
      </OptionalSection>
    );
  }

  // oneOf with string | null (like disabled_by)
  if (resolved.oneOf && !optionalArr.isOptional) {
    const hasString = resolved.oneOf.some((s) => s.type === "string");
    const hasNull = resolved.oneOf.some((s) => s.type === "null");
    const hasInteger = resolved.oneOf.some((s) => s.type === "integer");

    if (hasString && hasNull) {
      return (
        <StringField
          path={path}
          value={value === null ? "" : String(value ?? "")}
          onChange={(p, v) => onChange(p, v === "" ? null : v)}
          required={required}
          description={resolved.description}
        />
      );
    }
    if (hasInteger && hasNull) {
      return (
        <NumberField
          path={path}
          value={value === null ? "" : (value as number)}
          onChange={(p, v) => onChange(p, v === "" ? null : v)}
          required={required}
          isInteger
          description={resolved.description}
        />
      );
    }
  }

  // String with enum
  if (resolved.type === "string" && resolved.enum) {
    return (
      <EnumField
        path={path}
        value={String(value ?? "")}
        options={resolved.enum}
        onChange={onChange}
        required={required}
        description={resolved.description}
      />
    );
  }

  // Integer with enum (like lanes: [1, 4, 8, 16])
  if ((resolved.type === "integer" || resolved.type === "number") && resolved.enum) {
    return (
      <EnumField
        path={path}
        value={String(value ?? "")}
        options={resolved.enum}
        onChange={(p, v) => onChange(p, v === "" ? "" : Number(v))}
        required={required}
        description={resolved.description}
      />
    );
  }

  // Plain string
  if (resolved.type === "string") {
    return (
      <StringField
        path={path}
        value={String(value ?? "")}
        onChange={onChange}
        required={required}
        description={resolved.description}
      />
    );
  }

  // Number / integer
  if (resolved.type === "number" || resolved.type === "integer") {
    return (
      <NumberField
        path={path}
        value={value as number | string}
        onChange={onChange}
        required={required}
        minimum={resolved.minimum ?? resolved.exclusiveMinimum}
        maximum={resolved.maximum}
        isInteger={resolved.type === "integer"}
        description={resolved.description}
      />
    );
  }

  // Boolean
  if (resolved.type === "boolean") {
    return (
      <BooleanField
        path={path}
        value={!!value}
        onChange={onChange}
        required={required}
        description={resolved.description}
      />
    );
  }

  // Nested object
  if (resolved.type === "object" && resolved.properties) {
    return (
      <ObjectFieldset
        path={path}
        schema={resolved}
        rootSchema={rootSchema}
        formData={(value as Record<string, unknown>) ?? {}}
        onChange={onChange}
        required={required}
      />
    );
  }

  // Array
  if (resolved.type === "array") {
    const itemSchema = resolveItems(resolved.items, rootSchema);
    return (
      <ArrayField
        path={path}
        items={(value as unknown[]) ?? []}
        itemSchema={itemSchema}
        rootSchema={rootSchema}
        onChange={onChange}
        requiredFields={[]}
      />
    );
  }

  // Fallback: render as text input
  return (
    <StringField
      path={path}
      value={String(value ?? "")}
      onChange={onChange}
      required={required}
      description={resolved.description}
    />
  );
}


/* ------------------------------------------------------------------ */
/*  Object Field Renderers                                             */
/* ------------------------------------------------------------------ */

/** Render fields inside an object (no wrapping fieldset) */
function ObjectFields({
  path,
  schema,
  rootSchema,
  formData,
  onChange,
}: {
  path: string;
  schema: SchemaProperty;
  rootSchema: JsonSchema;
  formData: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}) {
  const properties = schema.properties ?? {};
  const requiredSet = new Set(schema.required ?? []);

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(properties).map(([key, propDef]) => {
        const fieldPath = path ? `${path}.${key}` : key;
        const value = formData?.[key];
        return (
          <SchemaField
            key={fieldPath}
            path={fieldPath}
            schema={propDef}
            rootSchema={rootSchema}
            value={value}
            onChange={onChange}
            required={requiredSet.has(key)}
          />
        );
      })}
    </div>
  );
}

/** Render an object as a grouped fieldset */
function ObjectFieldset({
  path,
  schema,
  rootSchema,
  formData,
  onChange,
  required,
}: {
  path: string;
  schema: SchemaProperty;
  rootSchema: JsonSchema;
  formData: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
  required: boolean;
}) {
  const label = formatLabel(path.split(".").pop() ?? path);
  return (
    <fieldset className="rounded-lg border border-zinc-700 p-4">
      <legend className="px-2 text-sm font-medium text-zinc-300">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </legend>
      <div className="mt-2">
        <ObjectFields
          path={path}
          schema={schema}
          rootSchema={rootSchema}
          formData={formData}
          onChange={onChange}
        />
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/*  Main FormEngine Component                                          */
/* ------------------------------------------------------------------ */

export default function FormEngine({
  schema,
  componentType,
  formData,
  onChange,
  onBatchChange,
  fieldFilter,
}: FormEngineProps) {
  const jsonSchema = schema as JsonSchema;
  const properties = jsonSchema.properties ?? {};
  const requiredFields = new Set(jsonSchema.required ?? []);

  // Auto-set schema_version and type on mount / type change
  useEffect(() => {
    const updates: Array<{ path: string; value: unknown }> = [];

    const expectedVersion = SCHEMA_VERSIONS[componentType];
    if (formData.schema_version !== expectedVersion) {
      updates.push({ path: "schema_version", value: expectedVersion });
    }

    if (componentType !== "motherboard") {
      const expectedType = TYPE_FIELD_VALUES[componentType];
      if (formData.type !== expectedType) {
        updates.push({ path: "type", value: expectedType });
      }
    }

    if (updates.length > 0) {
      onBatchChange(updates);
    }
  }, [componentType, formData.schema_version, formData.type, onBatchChange]);

  // Auto-generate id from manufacturer + model
  const handleFieldChange = useCallback(
    (path: string, value: unknown) => {
      if (path === "manufacturer" || path === "model") {
        const newManufacturer =
          path === "manufacturer" ? String(value) : String(formData.manufacturer ?? "");
        const newModel =
          path === "model" ? String(value) : String(formData.model ?? "");
        const newId =
          newManufacturer || newModel
            ? toKebabCase(newManufacturer + " " + newModel)
            : "";
        onBatchChange([
          { path, value },
          { path: "id", value: newId },
        ]);
      } else {
        onChange(path, value);
      }
    },
    [formData.manufacturer, formData.model, onChange, onBatchChange],
  );

  // Determine which fields to render and in what order
  const fieldEntries = Object.entries(properties).filter(([key]) => {
    // Always hide type for non-motherboard
    if (key === "type" && componentType !== "motherboard") return false;
    if (fieldFilter && !fieldFilter.has(key)) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-5">
      {fieldEntries.map(([key, propDef]) => {
        const value = formData[key];
        const isRequired = requiredFields.has(key);
        const resolved = resolveProperty(propDef, jsonSchema);

        // Auto-generated id field -- read-only
        if (key === "id") {
          return (
            <StringField
              key={key}
              path={key}
              value={String(value ?? "")}
              onChange={handleFieldChange}
              required={isRequired}
              readOnly
              description="Auto-generated from manufacturer + model"
            />
          );
        }

        // schema_version -- read-only
        if (key === "schema_version") {
          return (
            <StringField
              key={key}
              path={key}
              value={String(value ?? "")}
              onChange={handleFieldChange}
              required={isRequired}
              readOnly
              description={`Auto-set to ${SCHEMA_VERSIONS[componentType]} for ${componentType}`}
            />
          );
        }

        // type field (only shown for motherboard) -- read-only with const
        if (key === "type") {
          return (
            <StringField
              key={key}
              path={key}
              value={String(value ?? "")}
              onChange={handleFieldChange}
              required={isRequired}
              readOnly
              description="Component type (auto-set)"
            />
          );
        }

        // $ref at top level (e.g., memory -> MemoryConfig)
        if (propDef.$ref) {
          const refResolved = resolveRef(propDef.$ref, jsonSchema);
          if (refResolved?.type === "object" && refResolved.properties) {
            return (
              <ObjectFieldset
                key={key}
                path={key}
                schema={refResolved}
                rootSchema={jsonSchema}
                formData={(value as Record<string, unknown>) ?? {}}
                onChange={handleFieldChange}
                required={isRequired}
              />
            );
          }
        }

        return (
          <SchemaField
            key={key}
            path={key}
            schema={resolved}
            rootSchema={jsonSchema}
            value={value}
            onChange={handleFieldChange}
            required={isRequired}
          />
        );
      })}
    </div>
  );
}
