import Ajv from "ajv";
import addFormats from "ajv-formats";
import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export const DATA_DIR = path.resolve(__dirname, "..", "data");

/** Map a YAML file path (relative to project root) to its schema file path. */
export function getSchemaPath(filePath: string): string | null {
  const rel = path.relative(DATA_DIR, filePath).replace(/\\/g, "/");

  if (rel.startsWith("motherboards/")) {
    return path.join(DATA_DIR, "schema", "motherboard.schema.json");
  }

  const componentMatch = rel.match(/^components\/(nvme|gpu|ram|sata-ssd|sata-hdd|cpu)\//);
  if (componentMatch) {
    return path.join(DATA_DIR, "schema", `component-${componentMatch[1]}.schema.json`);
  }

  return null;
}

/** Recursively collect all .yaml files under a directory. */
function collectYamlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectYamlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".yaml")) {
      results.push(full);
    }
  }
  return results;
}

/** Get list of changed YAML files via git diff. */
function getChangedYamlFiles(): string[] {
  const projectRoot = path.resolve(__dirname, "..");
  try {
    const output = execSync("git diff --name-only HEAD", {
      cwd: projectRoot,
      encoding: "utf-8",
    }).trim();

    if (!output) return [];

    return output
      .split("\n")
      .filter((f) => f.endsWith(".yaml"))
      .filter((f) => f.startsWith("data/motherboards/") || f.startsWith("data/components/"))
      .map((f) => path.resolve(projectRoot, f));
  } catch {
    // If git diff fails (e.g. no commits yet), fall back to empty
    return [];
  }
}

function main(): void {
  const changedOnly = process.argv.includes("--changed-only");

  let files: string[];

  if (changedOnly) {
    files = getChangedYamlFiles();
  } else {
    files = [
      ...collectYamlFiles(path.join(DATA_DIR, "motherboards")),
      ...collectYamlFiles(path.join(DATA_DIR, "components")),
    ];
  }

  if (files.length === 0) {
    console.log("⚠ No YAML files found to validate.");
    process.exit(0);
  }

  // Cache compiled validators per schema path
  const validators = new Map<string, ReturnType<Ajv["compile"]>>();
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);

  let hasErrors = false;

  for (const filePath of files) {
    const schemaPath = getSchemaPath(filePath);

    if (!schemaPath) {
      console.error(`✗ ${filePath}: could not determine schema (unexpected path)`);
      hasErrors = true;
      continue;
    }

    if (!fs.existsSync(schemaPath)) {
      console.error(`✗ Missing schema file: ${schemaPath}`);
      hasErrors = true;
      continue;
    }

    // Load and compile schema (cached)
    if (!validators.has(schemaPath)) {
      const schemaJson = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
      validators.set(schemaPath, ajv.compile(schemaJson));
    }
    const validate = validators.get(schemaPath)!;

    // Parse YAML
    let data: unknown;
    try {
      data = yaml.load(fs.readFileSync(filePath, "utf-8"));
    } catch (err) {
      console.error(`✗ ${filePath}: YAML parse error — ${(err as Error).message}`);
      hasErrors = true;
      continue;
    }

    // Schema validation
    const valid = validate(data);
    if (!valid) {
      const errors = validate.errors!
        .map((e) => `  ${e.instancePath || "/"} ${e.message}`)
        .join("\n");
      console.error(`✗ ${filePath}: schema validation failed\n${errors}`);
      hasErrors = true;
      continue;
    }

    // ID-filename match
    const filenameStem = path.basename(filePath, ".yaml");
    const record = data as Record<string, unknown>;
    if (record.id !== filenameStem) {
      console.error(
        `✗ ${filePath}: id mismatch — file id "${record.id}" does not match filename stem "${filenameStem}"`
      );
      hasErrors = true;
      continue;
    }

    // RAM cross-field check: total_gb must equal per_module_gb * modules
    const rel = path.relative(DATA_DIR, filePath).replace(/\\/g, "/");
    if (rel.startsWith("components/ram/")) {
      const capacity = (record as Record<string, unknown>).capacity as
        | Record<string, number>
        | undefined;
      if (capacity) {
        const { total_gb, per_module_gb, modules } = capacity;
        if (
          typeof total_gb === "number" &&
          typeof per_module_gb === "number" &&
          typeof modules === "number" &&
          total_gb !== per_module_gb * modules
        ) {
          console.error(
            `✗ ${filePath}: capacity mismatch — total_gb (${total_gb}) does not equal per_module_gb (${per_module_gb}) * modules (${modules})`
          );
          hasErrors = true;
          continue;
        }
      }
    }

    console.log(`✓ ${filePath}`);
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log(`\n✓ All ${files.length} file(s) passed validation.`);
  process.exit(0);
}

if (require.main === module) {
  main();
}
