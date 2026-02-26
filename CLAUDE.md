# FuturStack - AI & SaaS Affiliate Blog

## Overview
Automated affiliate blog reviewing AI and SaaS tools. Published on Vercel.

## Tech Stack
- **SSG:** Hugo (v0.123+)
- **Hosting:** Vercel (futurstack.vercel.app)
- **Content Gen:** Node.js scripts using Anthropic Claude API
- **Image Gen:** OpenAI DALL-E API

## Key Files
- `hugo.toml` - Hugo config
- `data/affiliates.yaml` - All affiliate links (single source of truth)
- `data/tools.yaml` - Tool database (features, pricing, scores)
- `scripts/generate-content.js` - Content generation pipeline
- `scripts/generate-images.js` - Image generation

## Content Types
- `content/reviews/` - Individual tool reviews
- `content/comparisons/` - X vs Y articles
- `content/roundups/` - "Best of" lists
- `content/guides/` - How-to guides

## Shortcodes
- `{{</* affiliate "tool-id" */>}}` - Affiliate card with disclosure
- `{{</* proscons pros="a;b;c" cons="x;y;z" */>}}` - Pros/cons table
- `{{</* comparison "tool-a" "tool-b" */>}}` - Comparison table
- `{{</* rating 4.5 */>}}` - Star rating display

## Commands
```bash
hugo server          # Dev server
hugo --minify        # Build for production
node scripts/generate-content.js --type review --tool jasper  # Generate article
```

## Legal Requirements
- FTC affiliate disclosure on every article with affiliate links
- DSGVO privacy policy + cookie consent
- Impressum (German legal requirement)
- AI content disclosure in footer
- All affiliate links: rel="nofollow sponsored"
