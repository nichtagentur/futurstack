#!/usr/bin/env node
/**
 * FuturStack Image Generation via Gemini (Nano Banana)
 * Generates featured images for articles using Gemini 2.5 Flash image generation
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'static/images');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('Error: Set GEMINI_API_KEY');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// Image generation config for each type
const imageConfigs = {
  hero: {
    filename: 'hero-banner.png',
    prompt: `Create a wide panoramic hero banner image for a tech review website called "FuturStack".
Modern, sleek design with abstract flowing gradients in deep blue (#2563eb) and emerald green (#10b981) on a dark background.
Subtle geometric shapes like hexagons and circuit-like patterns floating.
Futuristic, clean, professional. No text, no logos, no people. Wide 16:9 aspect ratio. High quality.`
  },
  'jasper-ai': {
    filename: 'review-jasper-ai.png',
    prompt: `Modern tech illustration for an AI writing tool review. Abstract visual showing a glowing AI brain connected to floating document icons, pen/pencil shapes, and text blocks. Color palette: warm orange and coral gradients on a clean white/light gray background. Minimalist, editorial style. No text, no logos, no people. 16:9 ratio.`
  },
  'surfer-seo': {
    filename: 'review-surfer-seo.png',
    prompt: `Modern tech illustration for an SEO tool review. Abstract visual of rising bar charts, search magnifying glass, and interconnected data nodes. Color palette: ocean blue and teal gradients on a light background. Clean geometric shapes, growth arrows. Minimalist, editorial style. No text, no logos, no people. 16:9 ratio.`
  },
  'notion': {
    filename: 'review-notion.png',
    prompt: `Modern tech illustration for a productivity workspace tool review. Abstract visual showing organized blocks, interconnected document pages, database grids, and kanban boards floating in space. Color palette: black and white with subtle warm accents. Clean, minimal, Swiss design inspired. No text, no logos, no people. 16:9 ratio.`
  },
  'cursor': {
    filename: 'review-cursor.png',
    prompt: `Modern tech illustration for an AI code editor review. Abstract visual of code brackets, terminal window shapes, and AI neural network patterns merging together. Color palette: purple and violet gradients with electric blue accents on dark background. Futuristic developer aesthetic. No text, no logos, no people. 16:9 ratio.`
  },
  'canva': {
    filename: 'review-canva.png',
    prompt: `Modern tech illustration for a design tool review. Abstract visual showing colorful overlapping shapes - circles, rectangles, triangles - with gradient fills, paintbrush strokes, and creative design elements. Color palette: vibrant multicolor pastels - pink, purple, yellow, cyan. Playful but professional. No text, no logos, no people. 16:9 ratio.`
  },
  'jasper-vs-copyai': {
    filename: 'comparison-jasper-vs-copyai.png',
    prompt: `Modern tech illustration for an AI tool comparison article. Two abstract glowing spheres facing each other with energy streams between them, representing two competing tools. Left sphere in orange/coral, right sphere in blue/purple. Lightning-style connections between them. Dark background, dramatic lighting. No text, no logos, no people. 16:9 ratio.`
  },
  'surfer-vs-semrush': {
    filename: 'comparison-surfer-vs-semrush.png',
    prompt: `Modern tech illustration for an SEO tools comparison. Two abstract dashboard/analytics visualizations side by side, connected by data streams. Left side in teal, right side in deep red/orange. Bar charts, line graphs, search icons floating. Dark blue background. No text, no logos, no people. 16:9 ratio.`
  },
  'notion-vs-clickup': {
    filename: 'comparison-notion-vs-clickup.png',
    prompt: `Modern tech illustration for a project management tools comparison. Two abstract workspace layouts side by side - one minimal and clean (black/white), one colorful and feature-rich (purple/green). Connected by flowing data lines. Light gray background. No text, no logos, no people. 16:9 ratio.`
  },
  'roundup-ai-writing': {
    filename: 'roundup-ai-writing.png',
    prompt: `Modern tech illustration for a "best AI writing tools" roundup article. Five abstract glowing orbs arranged in a podium-like formation, each a different color (orange, blue, green, purple, pink). Floating text document shapes and AI circuit patterns around them. Gradient background from deep blue to black. No text, no logos, no people. 16:9 ratio.`
  },
  'roundup-seo': {
    filename: 'roundup-seo.png',
    prompt: `Modern tech illustration for a "best SEO tools" roundup article. Abstract search engine results page floating in space with glowing ranking arrows, magnifying glasses, and chart visualizations. Multiple tool icons represented as colorful geometric nodes. Blue and green color scheme on dark background. No text, no logos, no people. 16:9 ratio.`
  },
  'guide-ai-writing': {
    filename: 'guide-ai-writing-choice.png',
    prompt: `Modern tech illustration for a guide about choosing AI writing tools. Abstract decision tree or flowchart with glowing nodes, branching paths, and a clear arrow pointing to the right choice. Color palette: blue and emerald green gradients. Clean, instructional feel. Light background. No text, no logos, no people. 16:9 ratio.`
  },
  'guide-seo': {
    filename: 'guide-seo-beginner.png',
    prompt: `Modern tech illustration for a beginner's guide to AI-powered SEO. Abstract visual of a person's path from bottom to top - steps/stairs made of search bars, keywords, and chart elements leading upward to a glowing star/goal. Encouraging, growth-oriented. Blue and teal palette. Light background. No text, no logos, no people. 16:9 ratio.`
  }
};

async function generateImage(key, config) {
  console.log(`Generating: ${config.filename}...`);
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{
        parts: [{ text: config.prompt }]
      }],
      config: {
        responseModalities: ['image', 'text'],
      }
    });

    // Extract image from response
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        const filePath = path.join(IMAGES_DIR, config.filename);
        fs.writeFileSync(filePath, buffer);
        console.log(`  Saved: static/images/${config.filename} (${Math.round(buffer.length / 1024)}KB)`);
        return config.filename;
      }
    }
    console.log(`  Warning: No image data in response for ${key}`);
    return null;
  } catch (err) {
    console.error(`  Error generating ${key}: ${err.message}`);
    return null;
  }
}

// Map content files to their image configs
const contentImageMap = {
  'content/reviews/jasper-ai.md': 'jasper-ai',
  'content/reviews/surfer-seo.md': 'surfer-seo',
  'content/reviews/notion.md': 'notion',
  'content/reviews/cursor.md': 'cursor',
  'content/reviews/canva.md': 'canva',
  'content/comparisons/jasper-ai-vs-copy-ai.md': 'jasper-vs-copyai',
  'content/comparisons/surfer-seo-vs-semrush.md': 'surfer-vs-semrush',
  'content/comparisons/notion-vs-clickup.md': 'notion-vs-clickup',
  'content/roundups/best-ai-writing-tools.md': 'roundup-ai-writing',
  'content/roundups/best-seo-tools.md': 'roundup-seo',
  'content/guides/how-to-choose-the-best-ai-writing-tool-for-your-business.md': 'guide-ai-writing',
  'content/guides/getting-started-with-ai-powered-seo-a-beginner-s-guide.md': 'guide-seo',
};

function updateArticleFrontMatter(filePath, imageFilename) {
  const fullPath = path.join(ROOT, filePath);
  if (!fs.existsSync(fullPath)) return;

  let content = fs.readFileSync(fullPath, 'utf8');
  if (content.includes('featured_image:')) {
    // Replace existing
    content = content.replace(/featured_image:.*\n/, `featured_image: "/images/${imageFilename}"\n`);
  } else {
    // Add after first ---
    content = content.replace(/^---\n/, `---\nfeatured_image: "/images/${imageFilename}"\nfeatured_image_alt: "Article featured image"\n`);
  }
  fs.writeFileSync(fullPath, content);
  console.log(`  Updated: ${filePath}`);
}

async function main() {
  console.log('=== FuturStack Image Generation (Gemini / Nano Banana) ===\n');

  const keys = Object.keys(imageConfigs);
  let generated = 0;

  for (const key of keys) {
    const config = imageConfigs[key];
    const filename = await generateImage(key, config);
    if (filename) {
      generated++;
      // Update front matter for matching content files
      for (const [contentFile, imageKey] of Object.entries(contentImageMap)) {
        if (imageKey === key) {
          updateArticleFrontMatter(contentFile, filename);
        }
      }
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n=== Done: ${generated}/${keys.length} images generated ===`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
