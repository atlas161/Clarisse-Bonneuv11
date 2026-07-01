import { defineConfig, loadEnv } from 'vite';
import { minify } from 'html-minifier-terser';
import { handleAdminApi } from './server/admin-api.js';
import { getPortfolioPayload, PORTFOLIO_CACHE_CONTROL } from './server/cloudinary-portfolio.js';
import { seoHtmlPlugin, sitemapPlugin } from './server/seo-build.js';

const FAVICON_BASE_PATH = '/images-public/favicon';

const faviconHeadTags = [
  {
    tag: 'link',
    injectTo: 'head',
    attrs: {
      rel: 'icon',
      type: 'image/png',
      href: `${FAVICON_BASE_PATH}/favicon-96x96.png`,
      sizes: '96x96',
    },
  },
  {
    tag: 'link',
    injectTo: 'head',
    attrs: {
      rel: 'icon',
      type: 'image/svg+xml',
      href: `${FAVICON_BASE_PATH}/favicon.svg`,
    },
  },
  {
    tag: 'link',
    injectTo: 'head',
    attrs: {
      rel: 'shortcut icon',
      href: `${FAVICON_BASE_PATH}/favicon.ico`,
    },
  },
  {
    tag: 'link',
    injectTo: 'head',
    attrs: {
      rel: 'apple-touch-icon',
      sizes: '180x180',
      href: `${FAVICON_BASE_PATH}/apple-touch-icon.png`,
    },
  },
  {
    tag: 'meta',
    injectTo: 'head',
    attrs: {
      name: 'apple-mobile-web-app-title',
      content: 'ClarisseBonneu',
    },
  },
  {
    tag: 'link',
    injectTo: 'head',
    attrs: {
      rel: 'manifest',
      href: `${FAVICON_BASE_PATH}/site.webmanifest`,
    },
  },
];

const getPortfolioErrorMessage = (locale) =>
  locale === 'en'
    ? 'An error occurred while loading the Cloudinary portfolio.'
    : 'Une erreur est survenue lors du chargement du portfolio Cloudinary.';

const faviconHeadPlugin = () => ({
  name: 'favicon-head',
  transformIndexHtml() {
    return faviconHeadTags;
  },
});

const cookieConsentHeadPlugin = () => ({
  name: 'cookie-consent-head',
  transformIndexHtml() {
    return [
      {
        tag: 'script',
        injectTo: 'head-prepend',
        children:
          "(function(){if(window.__cbCookieConsentDefaultInit){return;}window.__cbCookieConsentDefaultInit=true;window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};window.gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});})();",
      },
    ];
  },
});

const htmlMinifyPlugin = () => ({
  name: 'html-minify',
  apply: 'build',
  enforce: 'post',
  async transformIndexHtml(html) {
    return minify(html, {
      collapseWhitespace: true,
      keepClosingSlash: true,
      minifyCSS: true,
      minifyJS: true,
      removeComments: true,
      removeRedundantAttributes: true,
    });
  },
});

const portfolioApiPlugin = () => ({
  name: 'portfolio-api',
  configureServer(server) {
    server.middlewares.use('/api/portfolio', async (req, res) => {
      try {
        const params = new URL(req.url || '/', 'http://localhost').searchParams;
        const root = params.get('root');
        const locale = params.get('locale') || undefined;
        const version = params.get('v') || undefined;
        const payload = await getPortfolioPayload(root || undefined, locale, version);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', PORTFOLIO_CACHE_CONTROL);
        res.end(JSON.stringify(payload));
      } catch (error) {
        const locale = new URL(req.url || '/', 'http://localhost').searchParams.get('locale');
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            error: 'portfolio_api_error',
            message: error instanceof Error ? error.message : getPortfolioErrorMessage(locale),
          })
        );
      }
    });
  },
});

const adminApiPlugin = () => ({
  name: 'admin-api',
  configureServer(server) {
    server.middlewares.use('/api/admin', handleAdminApi);
  },
  configurePreviewServer(server) {
    server.middlewares.use('/api/admin', handleAdminApi);
  },
});

const portfolioPreviewPlugin = () => ({
  name: 'portfolio-api-preview',
  configurePreviewServer(server) {
    server.middlewares.use('/api/portfolio', async (req, res) => {
      try {
        const params = new URL(req.url || '/', 'http://localhost').searchParams;
        const root = params.get('root');
        const locale = params.get('locale') || undefined;
        const version = params.get('v') || undefined;
        const payload = await getPortfolioPayload(root || undefined, locale, version);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', PORTFOLIO_CACHE_CONTROL);
        res.end(JSON.stringify(payload));
      } catch (error) {
        const locale = new URL(req.url || '/', 'http://localhost').searchParams.get('locale');
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            error: 'portfolio_api_error',
            message: error instanceof Error ? error.message : getPortfolioErrorMessage(locale),
          })
        );
      }
    });
  },
});

export default defineConfig(({ mode }) => {
  // The portfolio API runs in Node via Vite middleware, so it must receive local env values.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    plugins: [
      cookieConsentHeadPlugin(),
      faviconHeadPlugin(),
      portfolioApiPlugin(),
      portfolioPreviewPlugin(),
      adminApiPlugin(),
      seoHtmlPlugin(process.cwd()),
      sitemapPlugin(process.cwd()),
      htmlMinifyPlugin(),
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
    },
    build: {
      minify: 'esbuild',
      cssMinify: 'esbuild',
      rollupOptions: {
        input: {
          accueil: 'index.html',
          aPropos: 'a-propos.html',
          portfolio: 'portfolio.html',
          admin: 'admin.html',
          contact: 'contact.html',
          mentionsLegales: 'mentions-legales.html',
          politiqueConfidentialite: 'politique-confidentialite.html',
          enAccueil: 'en/index.html',
          enAbout: 'en/about.html',
          enPortfolio: 'en/portfolio.html',
          enContact: 'en/contact.html',
          enLegalNotice: 'en/legal-notice.html',
          enPrivacyPolicy: 'en/privacy-policy.html',
        },
      },
    },
  };
});
