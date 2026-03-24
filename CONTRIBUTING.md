# Contributing to PCSlotCheck

The primary way to contribute is by adding hardware data — motherboard and component YAML files. All data lives in the `data/` directory and is validated automatically via CI. When your PR is merged, the data syncs to the live database automatically.

## Getting Started

```bash
# Fork and clone the repo, then:
npm ci

# Validate your changes locally before pushing:
npm run validate
npm run check-duplicates
npm run sanity-check
```

## Data Directory Structure

```
data/
├── motherboards/{manufacturer}/{model-slug}.yaml
├── components/
│   ├── nvme/{model-slug}.yaml
│   ├── gpu/{model-slug}.yaml
│   ├── ram/{model-slug}.yaml
│   └── sata/{model-slug}.yaml
└── schema/                  # JSON Schema definitions (do not edit)
```

## File Naming Conventions

- Use **kebab-case** for all filenames: lowercase, words separated by hyphens.
- The filename (without `.yaml`) must match the `id` field inside the file.
- Examples:
  - `data/motherboards/msi/msi-mag-b850-tomahawk-wifi.yaml` → `id: msi-mag-b850-tomahawk-wifi`
  - `data/components/nvme/samsung-990-pro-2tb.yaml` → `id: samsung-990-pro-2tb`

## Example: Adding an NVMe Drive

The quickest way to start is copying an existing file and modifying it. Here's a minimal NVMe example:

```yaml
id: crucial-t700-2tb
type: nvme
manufacturer: Crucial
model: T700 2TB
schema_version: "1.0"

interface:
  protocol: NVMe
  pcie_gen: 5
  lanes: 4

form_factor: "2280"
key: M
capacity_gb: 2000

performance:
  seq_read_MBs: 12400
  seq_write_MBs: 11800

nand_type: TLC
controller: Phison E26
dram_cache: true

sources:
  - type: spec_page
    url: https://www.crucial.com/ssd/t700/CT2000T700SSD3
```

## Required Fields by Component Type

### Motherboard

`id`, `manufacturer`, `model`, `chipset`, `socket`, `form_factor`, `memory`, `m2_slots`, `pcie_slots`, `sata_ports`, `sources`, `schema_version`

- `memory`: includes type, speeds, capacity, ECC support, slot layout, and recommended population order.
- `m2_slots`: each slot needs interface type, PCIe gen/lanes, form factors, source (CPU/Chipset), SATA support, and any sharing rules.
- `pcie_slots`: each slot needs gen, lanes, physical size, source, and sharing rules.
- `sata_ports`: each port needs version, source, and what disables it (if anything).
- `sources`: at least one URL to the manufacturer spec page or manual.

### NVMe

`id`, `type` ("nvme"), `manufacturer`, `model`, `interface` (protocol, pcie_gen, lanes), `form_factor`, `capacity_gb`, `schema_version`

### GPU

`id`, `type` ("gpu"), `manufacturer`, `model`, `interface` (pcie_gen, lanes), `physical` (slot_width, length_mm), `power` (tdp_w, recommended_psu_w), `schema_version`

### RAM

`id`, `type` ("ram"), `manufacturer`, `model`, `interface` (type, speed_mhz, base_speed_mhz), `capacity` (per_module_gb, modules, total_gb), `schema_version`

### SATA Drive

`id`, `type` ("sata_drive"), `manufacturer`, `model`, `form_factor`, `capacity_gb`, `interface`, `schema_version`

## Contribution Workflow

1. **Fork** the repository and create a branch (e.g., `data/add-asus-rog-strix-b850`).
2. **Copy an existing YAML file** from the same category as a template.
3. **Fill in the specs** from the manufacturer's spec page or manual.
4. **Validate locally** before pushing:
   ```bash
   npm run validate
   npm run check-duplicates
   npm run sanity-check
   ```
5. **Open a Pull Request** targeting `main`.
6. CI will automatically run schema validation, duplicate checks, and sanity checks.
7. A maintainer reviews the data for accuracy and merges.
8. On merge, the data automatically syncs to the live database and appears on the site.

## Validation Rules

CI enforces the following on every PR that touches `data/`:

- All YAML files must pass schema validation against their JSON Schema.
- The `id` field must match the filename stem.
- No duplicate `id` values across the entire `data/` directory.
- Numeric values must be within reasonable ranges (e.g., PCIe gen ≤ 5, TDP ≤ 1000W, storage ≤ 64TB).

## Tips

- Use existing YAML files as templates — copy one and modify it.
- Always include a `sources` entry linking to the official spec page or manual.
- Set `schema_version` to `"1.0"` for all new files.
- If a slot has sharing rules (e.g., using M.2_3 disables SATA ports 5–6), document them in the `sharing` array. These are the hardest thing to get right — double-check against the manual.
- Motherboard sharing rules are the most valuable data we collect. Take extra care with those.
