import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // SITE/BASE_PATH styrs av miljön: GitHub Pages-förhandsvisningen sätter båda,
  // produktion på egen domän lämnar dem tomma.
  site: process.env.SITE ?? 'https://www.scandicmarketing.se',
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'never',
  integrations: [sitemap()],
  redirects: {
    '/contact': '/kontakt',
    '/booking': '/kontakt',
    '/artiklar': '/',
    '/tjanster': '/',
    // Ägaren säljer bara marknadsföring numera. De gamla tjänstesidorna
    // pekar om till erbjudandet i stället för att 404:a.
    '/hemsida': '/#tjanster',
    '/videoproduktion': '/#tjanster',
    '/fotografi': '/#tjanster',
  },
  build: {
    inlineStylesheets: 'always',
  },
});
