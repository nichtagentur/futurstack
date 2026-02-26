#!/usr/bin/env node
/**
 * FuturStack Image Generation
 * Generates featured images for articles using OpenAI DALL-E
 *
 * Usage:
 *   node scripts/generate-images.js                    # Generate for all articles missing images
 *   node scripts/generate-images.js --file <path>      # Generate for specific article
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'static/images');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error('Error: Set OPENAI_API_KEY');
  process.exit(1);
}

// Parse front matter from markdown file
function parseFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  match[1].split('\n').forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) fm[key.trim()] = rest.join(':').trim().replace(/^"|"$/g, '');
  });
  return fm;
}

// Generate image prompt based on article metadata
function buildImagePrompt(fm) {
  const category = fm.categories || fm.category || 'Technology';
  const title = fm.title || 'AI Tool';

  return `Clean, modern, minimalist blog header image for a tech review article titled "${title}".
Abstract geometric design with subtle tech elements (circuits, nodes, gradients).
Color palette: deep blue (#2563eb), emerald green (#10b981), white.
Professional, editorial style. No text, no logos, no people, no hands.
Wide format 16:9 ratio.`;
}

// Call OpenAI DALL-E API
async function generateImage(prompt, filename) {
  console.log(`  Generating: ${filename}`);
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1792x1024',
      quality: 'standard',
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`DALL-E API error: ${response.status} ${err.error?.message || ''}`);
  }

  const data = await response.json();
  const imageBuffer = Buffer.from(data.data[0].b64_json, 'base64');

  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const filepath = path.join(IMAGES_DIR, filename);
  fs.writeFileSync(filepath, imageBuffer);
  console.log(`  Saved: static/images/${filename}`);
  return `/images/${filename}`;
}

// Update front matter in markdown file with image path
function updateFrontMatter(filePath, imagePath, altText) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('featured_image:')) return; // Already has image

  content = content.replace(
    /^---\n/,
    `---\nfeatured_image: "${imagePath}"\nfeatured_image_alt: "${altText}"\n`
  );
  fs.writeFileSync(filePath, content);
  console.log(`  Updated front matter: ${path.basename(filePath)}`);
}

// Find all articles missing featured images
function findArticlesWithoutImages() {
  const articles = [];
  const contentDir = path.join(ROOT, 'content');
  const sections = ['reviews', 'comparisons', 'roundups', 'guides'];

  for (const section of sections) {
    const dir = path.join(contentDir, section);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('_'));
    for (const file of files) {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const fm = parseFrontMatter(content);
      if (!fm.featured_image) {
        articles.push({ filePath, fm, section, slug: file.replace('.md', '') });
      }
    }
  }
  return articles;
}

async function main() {
  const args = process.argv.slice(2);
  let articles;

  if (args[0] === '--file' && args[1]) {
    const filePath = path.resolve(args[1]);
    const content = fs.readFileSync(filePath, 'utf8');
    const fm = parseFrontMatter(content);
    articles = [{ filePath, fm, slug: path.basename(filePath, '.md') }];
  } else {
    articles = findArticlesWithoutImages();
  }

  if (articles.length === 0) {
    console.log('All articles already have featured images.');
    return;
  }

  console.log(`Found ${articles.length} articles without images.\n`);

  for (const article of articles) {
    try {
      const prompt = buildImagePrompt(article.fm);
      const filename = `${article.slug}.png`;
      const imagePath = await generateImage(prompt, filename);
      const altText = `Featured image for ${article.fm.title || article.slug}`;
      updateFrontMatter(article.filePath, imagePath, altText);
      console.log('');
    } catch (err) {
      console.error(`  Error generating image for ${article.slug}: ${err.message}\n`);
    }
  }

  console.log('Image generation complete.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
