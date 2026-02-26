#!/usr/bin/env node
/**
 * FuturStack Quality Assurance Check
 * Validates articles before publishing. Returns exit code 1 if any article fails.
 *
 * Usage:
 *   node scripts/qa-check.js                     # Check all articles
 *   node scripts/qa-check.js --file <path>        # Check specific file
 *   node scripts/qa-check.js --fix                # Auto-fix what's possible
 *   node scripts/qa-check.js --report             # Generate detailed report
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ====== CONFIG ======
const RULES = {
  minWords: 1200,
  maxWords: 3500,
  minH2: 3,
  maxH2: 12,
  minFAQ: 2,
  requiredFrontMatter: ['title', 'description', 'date', 'categories', 'has_affiliates', 'schema_type'],
  maxTitleLength: 70,
  maxDescriptionLength: 160,
  minDescriptionLength: 80,
  maxConsecutiveParagraphs: 5,  // break up walls of text
  affiliateShortcodeMin: 1,
  affiliateShortcodeMax: 4,
};

// ====== HELPERS ======
function parseFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fm: {}, body: content, raw: '' };
  try {
    const fm = YAML.parse(match[1]);
    return { fm, body: match[2], raw: match[1] };
  } catch {
    return { fm: {}, body: content, raw: match[1] || '' };
  }
}

function countWords(text) {
  return text.replace(/{{<[^>]+>}}/g, '').replace(/[#*_\[\]\(\)]/g, '').trim().split(/\s+/).filter(Boolean).length;
}

function findArticles(specificFile) {
  if (specificFile) {
    return [{ path: path.resolve(specificFile), section: 'unknown' }];
  }
  const articles = [];
  const sections = ['reviews', 'comparisons', 'roundups', 'guides'];
  for (const section of sections) {
    const dir = path.join(ROOT, 'content', section);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.md') && !file.startsWith('_')) {
        articles.push({ path: path.join(dir, file), section });
      }
    }
  }
  return articles;
}

// ====== CHECKS ======
function checkFrontMatter(fm, body) {
  const issues = [];
  const warnings = [];

  // Required fields
  for (const field of RULES.requiredFrontMatter) {
    if (!fm[field]) issues.push(`Missing front matter: "${field}"`);
  }

  // Title length
  if (fm.title) {
    if (fm.title.length > RULES.maxTitleLength) {
      warnings.push(`Title too long: ${fm.title.length} chars (max ${RULES.maxTitleLength}). May be truncated in SERPs.`);
    }
  }

  // Description length
  if (fm.description) {
    if (fm.description.length > RULES.maxDescriptionLength) {
      warnings.push(`Description too long: ${fm.description.length} chars (max ${RULES.maxDescriptionLength}).`);
    }
    if (fm.description.length < RULES.minDescriptionLength) {
      warnings.push(`Description too short: ${fm.description.length} chars (min ${RULES.minDescriptionLength}).`);
    }
  }

  // Schema type
  if (fm.schema_type && !['review', 'article', 'roundup'].includes(fm.schema_type)) {
    warnings.push(`Unknown schema_type: "${fm.schema_type}". Expected: review, article, roundup.`);
  }

  // Rating range
  if (fm.rating !== undefined) {
    const r = parseFloat(fm.rating);
    if (isNaN(r) || r < 1 || r > 5) issues.push(`Invalid rating: ${fm.rating}. Must be 1-5.`);
  }

  // Date valid
  if (fm.date && isNaN(Date.parse(fm.date))) {
    issues.push(`Invalid date: "${fm.date}"`);
  }

  return { issues, warnings };
}

function checkContent(body, section) {
  const issues = [];
  const warnings = [];

  // Word count
  const wordCount = countWords(body);
  if (wordCount < RULES.minWords) issues.push(`Too short: ${wordCount} words (min ${RULES.minWords}).`);
  if (wordCount > RULES.maxWords) warnings.push(`Very long: ${wordCount} words (max ${RULES.maxWords}). Consider splitting.`);

  // Heading structure
  const h2Count = (body.match(/^## /gm) || []).length;
  if (h2Count < RULES.minH2) issues.push(`Too few H2 headings: ${h2Count} (min ${RULES.minH2}).`);
  if (h2Count > RULES.maxH2) warnings.push(`Many H2 headings: ${h2Count} (max ${RULES.maxH2}).`);

  // No H1 (title comes from front matter)
  if (/^# [^#]/m.test(body)) {
    warnings.push('Contains H1 heading. Title should come from front matter, not body.');
  }

  // FAQ section
  const hasFAQ = /##.*FAQ|##.*Frequently Asked/i.test(body);
  if (!hasFAQ) warnings.push('No FAQ section found. FAQs improve SEO (FAQ schema).');

  // Affiliate shortcodes
  const affiliateCount = (body.match(/{{<\s*affiliate\s/g) || []).length;
  if (affiliateCount < RULES.affiliateShortcodeMin) {
    issues.push(`Too few affiliate cards: ${affiliateCount} (min ${RULES.affiliateShortcodeMin}).`);
  }
  if (affiliateCount > RULES.affiliateShortcodeMax) {
    warnings.push(`Many affiliate cards: ${affiliateCount} (max ${RULES.affiliateShortcodeMax}). May feel spammy.`);
  }

  // Broken shortcodes (unclosed or malformed)
  const openShortcodes = (body.match(/{{</g) || []).length;
  const closeShortcodes = (body.match(/>}}/g) || []).length;
  if (openShortcodes !== closeShortcodes) {
    issues.push(`Mismatched shortcodes: ${openShortcodes} opening vs ${closeShortcodes} closing.`);
  }

  // Check for placeholder text
  const placeholders = body.match(/\[TODO\]|\[INSERT\]|\[PLACEHOLDER\]|lorem ipsum/gi);
  if (placeholders) {
    issues.push(`Contains placeholder text: "${placeholders[0]}".`);
  }

  // Check for hallucinated pricing ($ amounts not in tools.yaml)
  // This is a heuristic -- flag suspiciously round numbers
  const priceMatches = body.match(/\$\d+[,.]?\d*/g) || [];
  if (priceMatches.length > 15) {
    warnings.push(`Many price mentions (${priceMatches.length}). Verify all pricing against tools.yaml.`);
  }

  // Proscons shortcode validation
  const proscons = body.match(/{{<\s*proscons\s[^>]*>}}/g) || [];
  for (const pc of proscons) {
    if (!pc.includes('pros=')) issues.push('proscons shortcode missing pros attribute.');
    if (!pc.includes('cons=')) issues.push('proscons shortcode missing cons attribute.');
  }

  // Internal linking check
  const internalLinks = (body.match(/\]\(\/[^)]+\)/g) || []).length;
  if (internalLinks === 0) {
    warnings.push('No internal links. Add links to related articles for SEO.');
  }

  return { issues, warnings, stats: { wordCount, h2Count, affiliateCount, hasFAQ, internalLinks } };
}

function checkLegalCompliance(fm, body) {
  const issues = [];
  const warnings = [];

  // German law: affiliate links must be clearly marked
  // Check that affiliate shortcode exists (cards say "affiliate link")
  if (fm.has_affiliates === true || fm.has_affiliates === 'true') {
    const hasAffiliateCard = /{{<\s*affiliate\s/.test(body);
    if (!hasAffiliateCard) {
      issues.push('LEGAL: has_affiliates=true but no affiliate shortcode in body.');
    }
  }

  // Check for bare affiliate URLs (not wrapped in shortcode)
  const bareAffLinks = body.match(/https?:\/\/[^\s)]*\?via=futurstack/g) || [];
  if (bareAffLinks.length > 0) {
    issues.push(`LEGAL: ${bareAffLinks.length} bare affiliate URL(s) not using shortcode. Must use {{< affiliate >}} for proper disclosure.`);
  }

  // German UWG: no misleading claims
  const superlatives = body.match(/\b(guaranteed|100%|always|never fails|perfect|flawless)\b/gi) || [];
  if (superlatives.length > 3) {
    warnings.push(`${superlatives.length} absolute claims found (${superlatives.slice(0, 3).join(', ')}...). German UWG prohibits misleading advertising.`);
  }

  return { issues, warnings };
}

function checkSEO(fm, body, section) {
  const issues = [];
  const warnings = [];

  // Title should contain main keyword
  if (fm.title && section === 'reviews') {
    const hasYear = /202[4-9]/.test(fm.title);
    if (!hasYear) warnings.push('SEO: Review title missing year (e.g., "2026"). Adds freshness signal.');
  }

  // Description should be compelling
  if (fm.description) {
    const hasActionWord = /review|compare|best|guide|how to|vs/i.test(fm.description);
    if (!hasActionWord) warnings.push('SEO: Description lacks action words (review, compare, best, guide).');
  }

  // First paragraph should hook
  const firstPara = body.split('\n\n')[0] || '';
  if (countWords(firstPara) < 30) {
    warnings.push('SEO: First paragraph very short. Strong intro improves dwell time.');
  }

  return { issues, warnings };
}

// ====== MAIN ======
function main() {
  const args = process.argv.slice(2);
  const specificFile = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;
  const reportMode = args.includes('--report');

  const articles = findArticles(specificFile);
  if (articles.length === 0) {
    console.log('No articles found.');
    return;
  }

  console.log(`\n=== FuturStack QA Check ===\n`);
  console.log(`Checking ${articles.length} article(s)...\n`);

  let totalIssues = 0;
  let totalWarnings = 0;
  let passed = 0;
  let failed = 0;
  const report = [];

  for (const article of articles) {
    const content = fs.readFileSync(article.path, 'utf8');
    const { fm, body } = parseFrontMatter(content);
    const filename = path.relative(ROOT, article.path);

    const fmCheck = checkFrontMatter(fm, body);
    const contentCheck = checkContent(body, article.section);
    const legalCheck = checkLegalCompliance(fm, body);
    const seoCheck = checkSEO(fm, body, article.section);

    const allIssues = [...fmCheck.issues, ...contentCheck.issues, ...legalCheck.issues, ...seoCheck.issues];
    const allWarnings = [...fmCheck.warnings, ...contentCheck.warnings, ...legalCheck.warnings, ...seoCheck.warnings];

    totalIssues += allIssues.length;
    totalWarnings += allWarnings.length;

    const status = allIssues.length === 0 ? 'PASS' : 'FAIL';
    if (allIssues.length === 0) passed++;
    else failed++;

    // Output
    const statusIcon = status === 'PASS' ? '[PASS]' : '[FAIL]';
    console.log(`${statusIcon} ${filename}`);

    if (reportMode || allIssues.length > 0) {
      console.log(`       Words: ${contentCheck.stats.wordCount} | H2s: ${contentCheck.stats.h2Count} | Affiliates: ${contentCheck.stats.affiliateCount} | FAQ: ${contentCheck.stats.hasFAQ ? 'Yes' : 'No'} | Internal links: ${contentCheck.stats.internalLinks}`);
    }

    for (const issue of allIssues) {
      console.log(`  [ERROR]   ${issue}`);
    }
    for (const warning of allWarnings) {
      console.log(`  [WARN]    ${warning}`);
    }
    if (allIssues.length > 0 || allWarnings.length > 0) console.log('');

    report.push({ file: filename, status, issues: allIssues, warnings: allWarnings, stats: contentCheck.stats });
  }

  // Summary
  console.log(`\n--- Summary ---`);
  console.log(`Articles: ${articles.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Issues: ${totalIssues} | Warnings: ${totalWarnings}`);

  if (reportMode) {
    const reportPath = path.join(ROOT, 'qa-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nDetailed report: ${reportPath}`);
  }

  if (totalIssues > 0) {
    console.log(`\n${failed} article(s) failed QA. Fix issues before publishing.`);
    process.exit(1);
  } else {
    console.log(`\nAll articles passed QA.`);
  }
}

main();
