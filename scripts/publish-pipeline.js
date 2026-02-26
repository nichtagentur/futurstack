#!/usr/bin/env node
/**
 * FuturStack Publishing Pipeline
 * Orchestrates: content planning -> generation -> QA -> image -> internal linking -> build -> deploy
 *
 * Usage:
 *   node scripts/publish-pipeline.js                # Auto-select next article from calendar
 *   node scripts/publish-pipeline.js --plan         # Show upcoming content calendar
 *   node scripts/publish-pipeline.js --force-type review --force-tool grammarly
 *   node scripts/publish-pipeline.js --dry-run      # Generate but don't deploy
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const API_KEY = process.env.CLAUDE_API_KEY_1 || process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error('Error: Set CLAUDE_API_KEY_1'); process.exit(1); }
const client = new Anthropic({ apiKey: API_KEY });

// ====== CONTENT CALENDAR LOGIC ======

// Priority tools -- highest commission, strongest affiliate programs
const PRIORITY_TOOLS = [
  // Tier 1: High recurring commissions (25%+ recurring)
  { id: 'jasper', priority: 1, reason: '30% recurring' },
  { id: 'surfer-seo', priority: 1, reason: '25% recurring' },
  { id: 'zapier', priority: 1, reason: '25% recurring' },
  { id: 'writesonic', priority: 1, reason: '30% recurring' },
  { id: 'grammarly', priority: 1, reason: '20% recurring' },
  { id: 'cursor', priority: 1, reason: '20% recurring' },
  { id: 'clickup', priority: 1, reason: '20% recurring' },
  // Tier 2: High one-time payouts
  { id: 'semrush', priority: 2, reason: '$200/sale' },
  { id: 'copy-ai', priority: 2, reason: '45% first payment' },
  { id: 'notion', priority: 2, reason: '50% up to $50' },
  { id: 'canva', priority: 2, reason: 'Up to $36/sale' },
];

// Content type rotation: ensures variety
const CONTENT_ROTATION = [
  'review',       // Week 1, Day 1
  'comparison',   // Week 1, Day 2
  'guide',        // Week 1, Day 3
  'review',       // Week 2, Day 1
  'roundup',      // Week 2, Day 2
  'review',       // Week 2, Day 3
];

// Comparison pairs (high-value matchups people actually search for)
const COMPARISON_PAIRS = [
  ['jasper', 'writesonic'],
  ['grammarly', 'jasper'],
  ['clickup', 'notion'],
  ['semrush', 'surfer-seo'],
  ['canva', 'midjourney'],
  ['zapier', 'clickup'],
  ['copy-ai', 'writesonic'],
  ['cursor', 'grammarly'],
];

// Roundup categories
const ROUNDUP_TOPICS = [
  { category: 'Productivity', title: 'Best Productivity Tools in 2026' },
  { category: 'Automation', title: 'Best Automation Tools for Small Business in 2026' },
  { category: 'Developer Tools', title: 'Best AI Developer Tools in 2026' },
  { category: 'Design', title: 'Best AI Design Tools in 2026' },
  { category: 'Project Management', title: 'Best Project Management Software in 2026' },
];

// Guide topics (high search volume)
const GUIDE_TOPICS = [
  'How to Automate Your Marketing Workflow with AI Tools',
  'How to Use AI for Content Marketing: A Complete Guide',
  'How to Improve Your Writing with AI Tools in 2026',
  'A Beginner\'s Guide to AI-Powered Project Management',
  'How to Build a Content Calendar Using AI Tools',
  'How to Reduce SaaS Costs: Audit and Optimize Your Tool Stack',
  'How to Create Professional Designs Without Design Skills Using AI',
  'How to Use AI Code Assistants to 10x Your Development Speed',
];

function getExistingContent() {
  const existing = { reviews: [], comparisons: [], roundups: [], guides: [] };
  for (const section of Object.keys(existing)) {
    const dir = path.join(ROOT, 'content', section);
    if (!fs.existsSync(dir)) continue;
    existing[section] = fs.readdirSync(dir)
      .filter(f => f.endsWith('.md') && !f.startsWith('_'))
      .map(f => f.replace('.md', ''));
  }
  return existing;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getNextArticle() {
  const existing = getExistingContent();
  const totalArticles = Object.values(existing).flat().length;
  const rotationIndex = totalArticles % CONTENT_ROTATION.length;
  const contentType = CONTENT_ROTATION[rotationIndex];

  switch (contentType) {
    case 'review': {
      // Find highest-priority tool without a review
      for (const tool of PRIORITY_TOOLS) {
        if (!existing.reviews.includes(tool.id) && !existing.reviews.includes(slugify(tool.id))) {
          // Check if tool exists in tools.yaml
          const tools = YAML.parse(fs.readFileSync(path.join(ROOT, 'data/tools.yaml'), 'utf8'));
          if (tools[tool.id]) {
            return { type: 'review', tool: tool.id, reason: `Priority: ${tool.reason}` };
          }
        }
      }
      // All priority tools reviewed -- pick any unreviewed
      const tools = YAML.parse(fs.readFileSync(path.join(ROOT, 'data/tools.yaml'), 'utf8'));
      for (const id of Object.keys(tools)) {
        if (!existing.reviews.includes(id) && !existing.reviews.includes(slugify(tools[id].name))) {
          return { type: 'review', tool: id, reason: 'Expanding coverage' };
        }
      }
      // Fallback to comparison
      return getNextComparison(existing);
    }
    case 'comparison': return getNextComparison(existing);
    case 'roundup': return getNextRoundup(existing);
    case 'guide': return getNextGuide(existing);
  }
}

function getNextComparison(existing) {
  for (const [a, b] of COMPARISON_PAIRS) {
    const slug = `${slugify(a)}-vs-${slugify(b)}`;
    const altSlug = `${slugify(b)}-vs-${slugify(a)}`;
    if (!existing.comparisons.includes(slug) && !existing.comparisons.includes(altSlug)) {
      return { type: 'comparison', tools: [a, b], reason: 'High search volume pair' };
    }
  }
  return { type: 'guide', topic: GUIDE_TOPICS[0], reason: 'All comparisons done, fallback to guide' };
}

function getNextRoundup(existing) {
  for (const topic of ROUNDUP_TOPICS) {
    const slug = `best-${slugify(topic.category)}-tools`;
    if (!existing.roundups.includes(slug)) {
      return { type: 'roundup', category: topic.category, reason: `Category: ${topic.category}` };
    }
  }
  return { type: 'guide', topic: GUIDE_TOPICS[0], reason: 'All roundups done, fallback to guide' };
}

function getNextGuide(existing) {
  for (const topic of GUIDE_TOPICS) {
    const slug = slugify(topic);
    if (!existing.guides.includes(slug)) {
      return { type: 'guide', topic, reason: 'High search volume topic' };
    }
  }
  return { type: 'review', tool: 'jasper', reason: 'All guides done, refresh existing' };
}

// ====== INTERNAL LINKING ======

function addInternalLinks(filePath) {
  const existing = getExistingContent();
  const tools = YAML.parse(fs.readFileSync(path.join(ROOT, 'data/tools.yaml'), 'utf8'));
  let content = fs.readFileSync(filePath, 'utf8');

  // Map tool names to their review URLs
  const linkMap = {};
  for (const [id, tool] of Object.entries(tools)) {
    const reviewSlug = existing.reviews.find(r => r === id || r === slugify(tool.name));
    if (reviewSlug) {
      linkMap[tool.name] = `/reviews/${reviewSlug}/`;
    }
  }

  // Find first unlinked mention of each tool name in the body and add a link
  let linksAdded = 0;
  const [frontMatter, ...bodyParts] = content.split('---\n');
  let body = bodyParts.slice(1).join('---\n') || bodyParts.join('---\n');

  for (const [name, url] of Object.entries(linkMap)) {
    // Don't link if the article IS the review for this tool
    if (filePath.includes(slugify(name))) continue;

    // Find first unlinked mention (not already inside []() or shortcode)
    const regex = new RegExp(`(?<![\\[/])\\b(${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b(?![\\]\\(])`, '');
    if (regex.test(body) && linksAdded < 3) {
      body = body.replace(regex, `[$1](${url})`);
      linksAdded++;
    }
  }

  if (linksAdded > 0) {
    const parts = content.split('---\n');
    const newContent = parts[0] + '---\n' + parts[1] + '---\n' + body;
    fs.writeFileSync(filePath, newContent);
    console.log(`  Added ${linksAdded} internal link(s)`);
  }
}

// ====== SHOW CONTENT PLAN ======

function showPlan() {
  console.log('\n=== FuturStack Content Calendar (Next 6 Articles) ===\n');
  const existing = getExistingContent();
  const total = Object.values(existing).flat().length;

  console.log(`Current content: ${total} articles`);
  console.log(`  Reviews: ${existing.reviews.length} | Comparisons: ${existing.comparisons.length} | Roundups: ${existing.roundups.length} | Guides: ${existing.guides.length}\n`);

  // Simulate next 6
  const simExisting = JSON.parse(JSON.stringify(existing));
  for (let i = 0; i < 6; i++) {
    const simTotal = Object.values(simExisting).flat().length;
    const rotIdx = simTotal % CONTENT_ROTATION.length;
    const next = getNextArticleFromState(simExisting, rotIdx);

    const week = Math.floor(i / 3) + 1;
    const day = ['Tue', 'Thu', 'Sat'][i % 3];
    console.log(`  Week ${week}, ${day}: [${next.type.toUpperCase()}] ${next.description}`);
    console.log(`           Reason: ${next.reason}`);

    // Add to simulated existing
    if (next.slug) {
      simExisting[next.type === 'review' ? 'reviews' : next.type === 'comparison' ? 'comparisons' : next.type === 'roundup' ? 'roundups' : 'guides'].push(next.slug);
    }
  }
  console.log('');
}

function getNextArticleFromState(existing, rotIdx) {
  const contentType = CONTENT_ROTATION[rotIdx];
  const tools = YAML.parse(fs.readFileSync(path.join(ROOT, 'data/tools.yaml'), 'utf8'));

  if (contentType === 'review') {
    for (const tool of PRIORITY_TOOLS) {
      if (tools[tool.id] && !existing.reviews.includes(tool.id) && !existing.reviews.includes(slugify(tools[tool.id]?.name || ''))) {
        return { type: 'review', description: `${tools[tool.id].name} Review`, reason: tool.reason, slug: tool.id };
      }
    }
  }
  if (contentType === 'comparison') {
    for (const [a, b] of COMPARISON_PAIRS) {
      const slug = `${slugify(a)}-vs-${slugify(b)}`;
      if (!existing.comparisons.includes(slug)) {
        return { type: 'comparison', description: `${tools[a]?.name || a} vs ${tools[b]?.name || b}`, reason: 'High search volume', slug };
      }
    }
  }
  if (contentType === 'roundup') {
    for (const topic of ROUNDUP_TOPICS) {
      const slug = `best-${slugify(topic.category)}-tools`;
      if (!existing.roundups.includes(slug)) {
        return { type: 'roundup', description: topic.title, reason: `Category gap: ${topic.category}`, slug };
      }
    }
  }
  if (contentType === 'guide') {
    for (const topic of GUIDE_TOPICS) {
      const slug = slugify(topic);
      if (!existing.guides.includes(slug)) {
        return { type: 'guide', description: topic, reason: 'High search volume', slug };
      }
    }
  }
  return { type: 'review', description: 'Content refresh', reason: 'All planned content created', slug: 'refresh' };
}

// ====== MAIN PIPELINE ======

async function runPipeline(opts) {
  console.log('\n=== FuturStack Publishing Pipeline ===\n');

  // Step 1: Determine what to write
  let article;
  if (opts.forceType && opts.forceTool) {
    article = { type: opts.forceType, tool: opts.forceTool, reason: 'Manual override' };
  } else if (opts.forceType && opts.forceTools) {
    article = { type: opts.forceType, tools: opts.forceTools, reason: 'Manual override' };
  } else if (opts.forceType && opts.forceTopic) {
    article = { type: opts.forceType, topic: opts.forceTopic, reason: 'Manual override' };
  } else if (opts.forceType && opts.forceCategory) {
    article = { type: opts.forceType, category: opts.forceCategory, reason: 'Manual override' };
  } else {
    article = getNextArticle();
  }

  console.log(`[1/7] PLANNING: ${article.type} -- ${article.tool || article.tools?.join(' vs ') || article.category || article.topic}`);
  console.log(`       Reason: ${article.reason}\n`);

  // Step 2: Generate content
  console.log('[2/7] GENERATING CONTENT...');
  let generatedFile;
  try {
    const args = buildGenerateArgs(article);
    execSync(`node ${path.join(ROOT, 'scripts/generate-content.js')} ${args}`, {
      cwd: ROOT,
      env: { ...process.env },
      stdio: 'inherit',
    });
    generatedFile = findNewestArticle();
    console.log(`       Generated: ${generatedFile}\n`);
  } catch (err) {
    console.error('  Content generation failed:', err.message);
    process.exit(1);
  }

  // Step 3: QA Check
  console.log('[3/7] QUALITY ASSURANCE...');
  try {
    execSync(`node ${path.join(ROOT, 'scripts/qa-check.js')} --file ${generatedFile}`, {
      cwd: ROOT,
      stdio: 'inherit',
    });
    console.log('       QA: PASSED\n');
  } catch {
    console.log('       QA: FAILED -- attempting auto-fix...\n');
    // Auto-fix: add affiliate shortcode if missing
    await autoFixArticle(generatedFile, article);
    // Re-check
    try {
      execSync(`node ${path.join(ROOT, 'scripts/qa-check.js')} --file ${generatedFile}`, {
        cwd: ROOT,
        stdio: 'inherit',
      });
      console.log('       QA after fix: PASSED\n');
    } catch {
      console.error('       QA: STILL FAILING after auto-fix. Manual review needed.');
      if (!opts.dryRun) process.exit(1);
    }
  }

  // Step 4: Generate image
  console.log('[4/7] GENERATING IMAGE...');
  try {
    execSync(`node ${path.join(ROOT, 'scripts/generate-images.js')} --file ${generatedFile}`, {
      cwd: ROOT,
      env: { ...process.env },
      stdio: 'inherit',
    });
  } catch {
    console.log('       Image generation skipped (non-critical).\n');
  }

  // Step 5: Add internal links
  console.log('[5/7] ADDING INTERNAL LINKS...');
  addInternalLinks(generatedFile);
  console.log('');

  // Step 6: Build test
  console.log('[6/7] BUILD TEST...');
  try {
    execSync('hugo --minify', { cwd: ROOT, stdio: 'pipe' });
    console.log('       Hugo build: SUCCESS\n');
  } catch (err) {
    console.error('       Hugo build: FAILED\n', err.stderr?.toString());
    process.exit(1);
  }

  // Step 7: Deploy (unless dry-run)
  if (opts.dryRun) {
    console.log('[7/7] DRY RUN -- skipping deploy.\n');
    console.log('=== Pipeline complete (dry run) ===');
    return;
  }

  console.log('[7/7] DEPLOYING...');
  try {
    // Git commit
    execSync('git add -A', { cwd: ROOT, stdio: 'pipe' });
    const commitMsg = `Publish: ${article.type} -- ${article.tool || article.tools?.join(' vs ') || article.topic || article.category}`;
    execSync(`git commit -m "${commitMsg}"`, { cwd: ROOT, stdio: 'pipe' });
    execSync('git push', { cwd: ROOT, stdio: 'pipe' });
    console.log('       Git: committed and pushed');

    // Vercel deploy
    if (process.env.VERCEL_TOKEN) {
      execSync(`npx vercel --prod --token "${process.env.VERCEL_TOKEN}" --yes`, { cwd: ROOT, stdio: 'pipe', timeout: 120000 });
      console.log('       Vercel: deployed to production');
    } else {
      console.log('       Vercel: skipped (no VERCEL_TOKEN)');
    }
    console.log('');
  } catch (err) {
    console.error('       Deploy error:', err.message);
  }

  console.log('=== Pipeline complete ===');
}

// ====== HELPERS ======

function buildGenerateArgs(article) {
  switch (article.type) {
    case 'review': return `--type review --tool ${article.tool}`;
    case 'comparison': return `--type comparison --tools "${article.tools.join(',')}"`;
    case 'roundup': return `--type roundup --category "${article.category}"`;
    case 'guide': return `--type guide --topic "${article.topic}"`;
    default: return '--batch';
  }
}

function findNewestArticle() {
  let newest = null;
  let newestTime = 0;
  const sections = ['reviews', 'comparisons', 'roundups', 'guides'];
  for (const section of sections) {
    const dir = path.join(ROOT, 'content', section);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.md') || file.startsWith('_')) continue;
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs > newestTime) {
        newestTime = stat.mtimeMs;
        newest = filePath;
      }
    }
  }
  return newest;
}

async function autoFixArticle(filePath, article) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix 1: Add affiliate shortcode if missing
  if (!content.includes('{{< affiliate')) {
    const toolId = article.tool || article.tools?.[0] || 'jasper';
    // Insert before the FAQ section or at the end
    const faqMatch = content.match(/^## .*FAQ/m);
    if (faqMatch) {
      content = content.replace(faqMatch[0], `{{< affiliate "${toolId}" >}}\n\n${faqMatch[0]}`);
    } else {
      content += `\n\n{{< affiliate "${toolId}" >}}\n`;
    }
    console.log(`       Auto-fix: Added affiliate shortcode for "${toolId}"`);
  }

  fs.writeFileSync(filePath, content);
}

// ====== CLI ======

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--plan')) {
    showPlan();
    return;
  }

  const opts = {
    dryRun: args.includes('--dry-run'),
    forceType: null,
    forceTool: null,
    forceTools: null,
    forceTopic: null,
    forceCategory: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--force-type') opts.forceType = args[++i];
    if (args[i] === '--force-tool') opts.forceTool = args[++i];
    if (args[i] === '--force-tools') opts.forceTools = args[++i].split(',');
    if (args[i] === '--force-topic') opts.forceTopic = args[++i];
    if (args[i] === '--force-category') opts.forceCategory = args[++i];
  }

  runPipeline(opts).catch(err => {
    console.error('Pipeline error:', err.message);
    process.exit(1);
  });
}

main();
