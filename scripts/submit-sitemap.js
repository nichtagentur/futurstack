#!/usr/bin/env node
/**
 * FuturStack Sitemap Submission
 * Pings Google with the sitemap URL after deployment
 */

const SITE_URL = process.env.SITE_URL || 'https://futurstack.vercel.app';
const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;

async function main() {
  console.log(`Submitting sitemap: ${SITEMAP_URL}`);

  // Google ping endpoint
  const googleUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`;

  try {
    const response = await fetch(googleUrl);
    if (response.ok) {
      console.log('Google sitemap ping: OK');
    } else {
      console.log(`Google sitemap ping: ${response.status}`);
    }
  } catch (err) {
    console.error(`Google ping failed: ${err.message}`);
  }
}

main();
