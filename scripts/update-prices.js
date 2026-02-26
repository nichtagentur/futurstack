#!/usr/bin/env node
/**
 * FuturStack Price Updater
 * Checks and updates pricing data in tools.yaml
 *
 * Currently a placeholder -- in production, this would scrape
 * pricing pages or use affiliate API endpoints to get current pricing.
 * For now it validates the YAML structure and logs the current state.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function main() {
  const toolsPath = path.join(ROOT, 'data/tools.yaml');
  const tools = YAML.parse(fs.readFileSync(toolsPath, 'utf8'));

  console.log('=== FuturStack Price Check ===\n');

  for (const [id, tool] of Object.entries(tools)) {
    const prices = tool.pricing?.map(p => `${p.tier}: ${p.price}`).join(', ') || 'N/A';
    console.log(`${tool.name} (${id}): ${prices}`);
  }

  console.log(`\nTotal tools: ${Object.keys(tools).length}`);
  console.log('Price check complete. Manual verification recommended for changed prices.');
}

main();
