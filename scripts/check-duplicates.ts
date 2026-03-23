import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(__dirname, "..", "data");

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

function main(): void {
  const files = [
    ...collectYamlFiles(path.join(DATA_DIR, "motherboards")),
    ...collectYamlFiles(path.join(DATA_DIR, "components")),
  ];

  if (files.length === 0) {
    console.log("⚠ No YAML files found to check for duplicates.");
    process.exit(0);
  }

  // Map each id to the list of files it appears in
  const idToFiles = new Map<string, string[]>();

  for (const filePath of files) {
    let data: unknown;
    try {
      data = yaml.load(fs.readFileSync(filePath, "utf-8"));
    } catch (err) {
      console.error(`✗ ${filePath}: YAML parse error — ${(err as Error).message}`);
      continue;
    }

    const record = data as Record<string, unknown>;
    const id = record?.id;

    if (typeof id !== "string") {
      continue;
    }

    const relPath = path.relative(path.resolve(DATA_DIR, ".."), filePath).replace(/\\/g, "/");

    if (!idToFiles.has(id)) {
      idToFiles.set(id, []);
    }
    idToFiles.get(id)!.push(relPath);
  }

  // Find duplicates
  let hasDuplicates = false;

  for (const [id, filePaths] of idToFiles) {
    if (filePaths.length > 1) {
      hasDuplicates = true;
      console.error(`✗ Duplicate ID "${id}" found in:`);
      for (const fp of filePaths) {
        console.error(`  - ${fp}`);
      }
    }
  }

  if (hasDuplicates) {
    process.exit(1);
  }

  console.log(`✓ No duplicate IDs found across ${files.length} file(s).`);
  process.exit(0);
}

main();
