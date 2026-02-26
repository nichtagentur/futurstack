#!/usr/bin/env node
/**
 * FuturStack Content Generation Pipeline
 * Generates SEO-optimized articles using Claude API
 *
 * Usage:
 *   node scripts/generate-content.js --type review --tool jasper
 *   node scripts/generate-content.js --type comparison --tools "jasper,copy-ai"
 *   node scripts/generate-content.js --type roundup --category "AI Writing"
 *   node scripts/generate-content.js --type guide --topic "How to Choose an AI Writing Tool"
 *   node scripts/generate-content.js --batch  (generates one of each type)
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load API key from environment
const API_KEY = process.env.CLAUDE_API_KEY_1 || process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('Error: Set CLAUDE_API_KEY_1 or ANTHROPIC_API_KEY');
  process.exit(1);
}

const client = new Anthropic({ apiKey: API_KEY });

// Load tool and affiliate data
function loadData() {
  const tools = YAML.parse(fs.readFileSync(path.join(ROOT, 'data/tools.yaml'), 'utf8'));
  const affiliates = YAML.parse(fs.readFileSync(path.join(ROOT, 'data/affiliates.yaml'), 'utf8'));
  return { tools, affiliates };
}

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type') opts.type = args[++i];
    else if (args[i] === '--tool') opts.tool = args[++i];
    else if (args[i] === '--tools') opts.tools = args[++i].split(',');
    else if (args[i] === '--category') opts.category = args[++i];
    else if (args[i] === '--topic') opts.topic = args[++i];
    else if (args[i] === '--batch') opts.batch = true;
  }
  return opts;
}

// Generate a slug from title
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Today's date in YYYY-MM-DD format
function today() {
  return new Date().toISOString().split('T')[0];
}

// Build prompt for review article
function reviewPrompt(toolId, toolData, affiliateData) {
  return `You are writing a comprehensive, SEO-optimized review article for FuturStack, an expert AI and SaaS tool review blog.

## Tool to Review
Name: ${toolData.name}
Category: ${toolData.category}
Website: ${toolData.website}
Rating: ${toolData.rating}/5

### Pricing Tiers
${toolData.pricing.map(p => `- ${p.tier}: ${p.price} (${p.features.join(', ')})`).join('\n')}

### Features
${toolData.features.map(f => `- ${f}`).join('\n')}

### Pros
${toolData.pros.map(p => `- ${p}`).join('\n')}

### Cons
${toolData.cons.map(c => `- ${c}`).join('\n')}

Best for: ${toolData.best_for}

## Writing Instructions

Write a 1500-2500 word review article. Structure:

1. **Introduction** (2-3 paragraphs) - Hook with the problem this tool solves, mention who it's for
2. **What is [Tool Name]?** - Brief overview
3. **Key Features** - Detailed feature breakdown with H3 subheadings for top 4-5 features
4. **Pricing Analysis** - Break down each tier, mention value for money
5. **Pros and Cons** - Use the Hugo shortcode: {{</* proscons pros="pro1;pro2;pro3" cons="con1;con2;con3" */>}}
6. **Who Should Use [Tool Name]?** - Specific use cases
7. **Who Should NOT Use [Tool Name]?** - Honest assessment
8. **Our Verdict** - Final rating and recommendation. Include: {{</* rating ${toolData.rating} */>}}
9. **FAQ** - 4-5 common questions with concise answers

## Shortcode Usage
- Place exactly ONE affiliate card using: {{</* affiliate "${toolId}" */>}}
  Put it after the pricing section or in the verdict section (natural placement).
- Use {{</* proscons pros="..." cons="..." */>}} for the pros/cons section (semicolon-separated items)
- Use {{</* rating ${toolData.rating} */>}} in the verdict

## Tone & Style
- Expert but accessible -- like a knowledgeable friend giving advice
- First-person plural ("we tested", "in our experience")
- Specific details and numbers, not vague claims
- Honest -- mention real limitations
- Buyer-intent focused: help the reader decide if this tool is right for THEM
- No emojis, no hype language

## SEO
- Target keyword: "${toolData.name} review 2026"
- Use the keyword naturally in intro, one H2, and conclusion
- Include related terms: pricing, features, alternatives, pros cons

## Output Format
Return ONLY the article body in Markdown (H2 and H3 headings, no H1). Do not include front matter -- that will be added separately. Do not include a title heading.`;
}

// Build prompt for comparison article
function comparisonPrompt(toolAId, toolBId, toolAData, toolBData) {
  return `You are writing a comprehensive comparison article for FuturStack, an expert AI and SaaS tool review blog.

## Tools to Compare

### Tool A: ${toolAData.name}
Category: ${toolAData.category}
Rating: ${toolAData.rating}/5
Starting Price: ${toolAData.pricing[0]?.price || 'N/A'}
Pros: ${toolAData.pros.join(', ')}
Cons: ${toolAData.cons.join(', ')}
Best for: ${toolAData.best_for}
Features: ${toolAData.features.join(', ')}

### Tool B: ${toolBData.name}
Category: ${toolBData.category}
Rating: ${toolBData.rating}/5
Starting Price: ${toolBData.pricing[0]?.price || 'N/A'}
Pros: ${toolBData.pros.join(', ')}
Cons: ${toolBData.cons.join(', ')}
Best for: ${toolBData.best_for}
Features: ${toolBData.features.join(', ')}

## Writing Instructions

Write a 1500-2200 word comparison article. Structure:

1. **Introduction** - What both tools do, why someone would compare them
2. **Quick Comparison** - Use: {{</* comparison "${toolAId}" "${toolBId}" */>}}
3. **Features Comparison** - H3 sections for key feature areas (4-5 areas)
4. **Pricing Comparison** - Detailed tier-by-tier comparison, value analysis
5. **Pros and Cons** - Side by side for each tool using proscons shortcode
6. **Which Should You Choose?** - Decision framework based on use case
7. **Our Verdict** - Clear recommendation with nuance (Tool A if X, Tool B if Y)
8. **FAQ** - 3-4 comparison questions

## Shortcode Usage
- {{</* comparison "${toolAId}" "${toolBId}" */>}} in the quick comparison section
- {{</* affiliate "${toolAId}" */>}} after the verdict for winner
- {{</* affiliate "${toolBId}" */>}} after the first affiliate card
- {{</* proscons pros="..." cons="..." */>}} for each tool's pros/cons

## Tone: Expert, balanced, helpful. No hype. Use "we" voice.
## SEO Target: "${toolAData.name} vs ${toolBData.name} 2026"
## Output: Markdown body only (H2/H3, no H1, no front matter).`;
}

// Build prompt for roundup article
function roundupPrompt(category, toolsInCategory) {
  const toolList = toolsInCategory.map(([id, t]) =>
    `- ${t.name} (${id}): Rating ${t.rating}/5, From ${t.pricing[0]?.price || 'N/A'}, Best for: ${t.best_for}`
  ).join('\n');

  return `You are writing a "best of" roundup article for FuturStack, an expert AI and SaaS tool review blog.

## Category: ${category}
## Tools to Include:
${toolList}

## Writing Instructions

Write a 1800-2500 word roundup article: "Best ${category} Tools in 2026". Structure:

1. **Introduction** - Why this category matters, what to look for
2. **How We Evaluated** - Brief methodology (features, pricing, ease of use, support)
3. **The Best ${category} Tools** - One H3 section per tool with:
   - 2-3 paragraph mini-review
   - Key strengths
   - Starting price
   - Best for which use case
   - Affiliate card shortcode
4. **Comparison Table** - Quick summary (or mention readers can check individual reviews)
5. **How to Choose** - Decision framework
6. **FAQ** - 3-4 questions about the category

## Shortcode Usage
- {{</* affiliate "tool-id" */>}} after each tool's mini-review section
- {{</* rating X.X */>}} for each tool's rating

## Tone: Authoritative curator. Rank tools clearly. No hype.
## SEO Target: "best ${category.toLowerCase()} tools 2026"
## Output: Markdown body only (H2/H3, no H1, no front matter).`;
}

// Build prompt for guide article
function guidePrompt(topic) {
  return `You are writing a practical how-to guide for FuturStack, an expert AI and SaaS tool review blog.

## Topic: ${topic}

## Writing Instructions

Write a 1500-2000 word guide article. Structure:

1. **Introduction** - What the reader will learn and why it matters
2. **Prerequisites / What You Need** - Brief setup if applicable
3. **Step-by-Step Guide** - 5-7 clear steps with H3 headings
4. **Tips and Best Practices** - 3-5 expert tips
5. **Common Mistakes to Avoid** - 3-4 pitfalls
6. **Recommended Tools** - Mention 2-3 relevant tools with affiliate cards
7. **FAQ** - 3-4 questions

## Shortcode Usage
- {{</* affiliate "tool-id" */>}} for 2-3 recommended tools (use real tool IDs: jasper, copy-ai, surfer-seo, writesonic, notion, clickup, canva, grammarly, zapier, semrush, cursor)
- {{</* rating X.X */>}} when mentioning tool ratings

## Tone: Practical teacher. Step-by-step clarity. Use "you" voice.
## SEO Target: "${topic.toLowerCase()}"
## Output: Markdown body only (H2/H3, no H1, no front matter).`;
}

// Call Claude API to generate content
async function generateWithClaude(prompt) {
  console.log('  Calling Claude API...');
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content[0].text;
}

// Generate front matter
function generateFrontMatter(opts) {
  const fm = {
    title: opts.title,
    description: opts.description,
    date: today(),
    draft: false,
    categories: [opts.category || 'General'],
    tags: opts.tags || [],
    has_affiliates: true,
    schema_type: opts.schemaType || 'article',
  };
  if (opts.rating) fm.rating = opts.rating;
  if (opts.toolName) fm.tool_name = opts.toolName;
  if (opts.toolCategory) fm.tool_category = opts.toolCategory;
  if (opts.listCount) fm.list_count = opts.listCount;
  if (opts.featuredImage) fm.featured_image = opts.featuredImage;
  if (opts.featuredImageAlt) fm.featured_image_alt = opts.featuredImageAlt;

  let yaml = '---\n';
  for (const [key, val] of Object.entries(fm)) {
    if (Array.isArray(val)) {
      yaml += `${key}:\n${val.map(v => `  - "${v}"`).join('\n')}\n`;
    } else if (typeof val === 'string') {
      yaml += `${key}: "${val.replace(/"/g, '\\"')}"\n`;
    } else {
      yaml += `${key}: ${val}\n`;
    }
  }
  yaml += '---\n\n';
  return yaml;
}

// Write article to file
function writeArticle(section, slug, frontMatter, content) {
  const dir = path.join(ROOT, 'content', section);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${slug}.md`);
  fs.writeFileSync(filePath, frontMatter + content);
  console.log(`  Written: content/${section}/${slug}.md`);
  return filePath;
}

// Generate a review
async function generateReview(toolId, data) {
  const toolData = data.tools[toolId];
  if (!toolData) {
    console.error(`Tool "${toolId}" not found in tools.yaml`);
    return null;
  }
  console.log(`Generating review: ${toolData.name}...`);

  const prompt = reviewPrompt(toolId, toolData, data.affiliates[toolId]);
  const content = await generateWithClaude(prompt);

  const fm = generateFrontMatter({
    title: `${toolData.name} Review 2026: Features, Pricing, and Verdict`,
    description: `Comprehensive ${toolData.name} review. We tested features, pricing tiers, pros and cons. Find out if ${toolData.name} is worth it in 2026.`,
    category: toolData.category,
    tags: [toolData.category, toolData.name, 'Review', 'AI Tools'],
    schemaType: 'review',
    rating: toolData.rating,
    toolName: toolData.name,
    toolCategory: toolData.category,
  });

  return writeArticle('reviews', slugify(toolData.name), fm, content);
}

// Generate a comparison
async function generateComparison(toolAId, toolBId, data) {
  const toolA = data.tools[toolAId];
  const toolB = data.tools[toolBId];
  if (!toolA || !toolB) {
    console.error(`Tool(s) not found: ${toolAId}, ${toolBId}`);
    return null;
  }
  console.log(`Generating comparison: ${toolA.name} vs ${toolB.name}...`);

  const prompt = comparisonPrompt(toolAId, toolBId, toolA, toolB);
  const content = await generateWithClaude(prompt);

  const fm = generateFrontMatter({
    title: `${toolA.name} vs ${toolB.name}: Which Is Better in 2026?`,
    description: `${toolA.name} vs ${toolB.name} comparison. We compare features, pricing, pros and cons to help you choose the right tool.`,
    category: toolA.category,
    tags: [toolA.category, toolA.name, toolB.name, 'Comparison'],
    schemaType: 'article',
  });

  const slug = `${slugify(toolA.name)}-vs-${slugify(toolB.name)}`;
  return writeArticle('comparisons', slug, fm, content);
}

// Generate a roundup
async function generateRoundup(category, data) {
  const toolsInCategory = Object.entries(data.tools).filter(([, t]) => t.category === category);
  if (toolsInCategory.length === 0) {
    console.error(`No tools found in category: ${category}`);
    return null;
  }
  console.log(`Generating roundup: Best ${category} Tools...`);

  const prompt = roundupPrompt(category, toolsInCategory);
  const content = await generateWithClaude(prompt);

  const fm = generateFrontMatter({
    title: `Best ${category} Tools in 2026: Expert Picks`,
    description: `Our expert picks for the best ${category.toLowerCase()} tools in 2026. Detailed analysis of features, pricing, and use cases.`,
    category: category,
    tags: [category, 'Best Of', 'Roundup', '2026'],
    schemaType: 'roundup',
    listCount: toolsInCategory.length,
  });

  return writeArticle('roundups', `best-${slugify(category)}-tools`, fm, content);
}

// Generate a guide
async function generateGuide(topic, data) {
  console.log(`Generating guide: ${topic}...`);

  const prompt = guidePrompt(topic);
  const content = await generateWithClaude(prompt);

  const fm = generateFrontMatter({
    title: topic,
    description: `A practical guide: ${topic}. Step-by-step instructions, tips, and tool recommendations.`,
    category: 'Guides',
    tags: ['Guide', 'How To', 'AI Tools'],
    schemaType: 'article',
  });

  return writeArticle('guides', slugify(topic), fm, content);
}

// Main
async function main() {
  const opts = parseArgs();
  const data = loadData();

  if (opts.batch) {
    console.log('=== Batch Content Generation ===\n');

    // 5 reviews
    const reviewTools = ['jasper', 'surfer-seo', 'notion', 'cursor', 'canva'];
    for (const toolId of reviewTools) {
      await generateReview(toolId, data);
      console.log('');
    }

    // 3 comparisons
    const comparisons = [
      ['jasper', 'copy-ai'],
      ['surfer-seo', 'semrush'],
      ['notion', 'clickup'],
    ];
    for (const [a, b] of comparisons) {
      await generateComparison(a, b, data);
      console.log('');
    }

    // 2 roundups
    for (const cat of ['AI Writing', 'SEO']) {
      await generateRoundup(cat, data);
      console.log('');
    }

    // 2 guides
    const guides = [
      'How to Choose the Best AI Writing Tool for Your Business',
      'Getting Started with AI-Powered SEO: A Beginner\'s Guide',
    ];
    for (const topic of guides) {
      await generateGuide(topic, data);
      console.log('');
    }

    console.log('=== Batch generation complete! ===');
    return;
  }

  // Single generation
  switch (opts.type) {
    case 'review':
      if (!opts.tool) { console.error('--tool required'); process.exit(1); }
      await generateReview(opts.tool, data);
      break;
    case 'comparison':
      if (!opts.tools || opts.tools.length < 2) { console.error('--tools "a,b" required'); process.exit(1); }
      await generateComparison(opts.tools[0], opts.tools[1], data);
      break;
    case 'roundup':
      if (!opts.category) { console.error('--category required'); process.exit(1); }
      await generateRoundup(opts.category, data);
      break;
    case 'guide':
      if (!opts.topic) { console.error('--topic required'); process.exit(1); }
      await generateGuide(opts.topic, data);
      break;
    default:
      console.log('Usage:');
      console.log('  --type review --tool <id>');
      console.log('  --type comparison --tools "<id1>,<id2>"');
      console.log('  --type roundup --category "<category>"');
      console.log('  --type guide --topic "<topic>"');
      console.log('  --batch  (generate full set)');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
