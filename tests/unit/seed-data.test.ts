import { describe, test, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_DIR = path.join(ROOT, 'data', 'schema');

function loadSchema(name: string): object {
  const raw = fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf-8');
  return JSON.parse(raw);
}

function loadYaml(relPath: string): unknown {
  const raw = fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
  return yaml.load(raw);
}

function stemOf(filePath: string): string {
  return path.basename(filePath, '.yaml');
}

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const motherboardSchema = loadSchema('motherboard.schema.json');
const nvmeSchema = loadSchema('component-nvme.schema.json');
const gpuSchema = loadSchema('component-gpu.schema.json');
const ramSchema = loadSchema('component-ram.schema.json');
const sataSchema = loadSchema('component-sata.schema.json');

interface SeedFile {
  relPath: string;
  schema: object;
  label: string;
}

const seedFiles: SeedFile[] = [
  // Motherboards
  {
    relPath: 'data/motherboards/msi/msi-mag-x870-tomahawk-wifi.yaml',
    schema: motherboardSchema,
    label: 'MSI MAG X870 TOMAHAWK WIFI',
  },
  {
    relPath: 'data/motherboards/asus/asus-rog-strix-z890-f-gaming-wifi.yaml',
    schema: motherboardSchema,
    label: 'ASUS ROG STRIX Z890-F GAMING WIFI',
  },
  // NVMe
  {
    relPath: 'data/components/nvme/samsung-990-pro-2tb.yaml',
    schema: nvmeSchema,
    label: 'Samsung 990 PRO 2TB',
  },
  {
    relPath: 'data/components/nvme/wd-black-sn770-1tb.yaml',
    schema: nvmeSchema,
    label: 'WD BLACK SN770 1TB',
  },
  // GPU
  {
    relPath: 'data/components/gpu/nvidia-rtx-4070-ti-super.yaml',
    schema: gpuSchema,
    label: 'NVIDIA RTX 4070 Ti SUPER',
  },
  // RAM
  {
    relPath: 'data/components/ram/corsair-vengeance-ddr5-6000-32gb.yaml',
    schema: ramSchema,
    label: 'Corsair Vengeance DDR5-6000 32GB',
  },
  // SATA
  {
    relPath: 'data/components/sata/samsung-870-evo-1tb.yaml',
    schema: sataSchema,
    label: 'Samsung 870 EVO 1TB',
  },
];

describe('Seed data validation', () => {
  for (const { relPath, schema, label } of seedFiles) {
    describe(label, () => {
      const data = loadYaml(relPath);
      const validate = ajv.compile(schema);

      test('passes schema validation with zero errors', () => {
        const valid = validate(data);
        expect(validate.errors).toBeNull();
        expect(valid).toBe(true);
      });

      test('id matches filename stem', () => {
        const stem = stemOf(relPath);
        expect((data as Record<string, unknown>).id).toBe(stem);
      });
    });
  }
});
