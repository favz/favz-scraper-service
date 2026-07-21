// api/scrape.js
// Scraper serverless para Vercel usando Playwright + @sparticuz/chromium
// Endpoint: /api/scrape?url=PRODUCT_URL

import chromium from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright-core';

// Vercel Hobby plan: 10s de limite de execução.
// Reservamos margem para cold start do chromium + resposta.
const NAV_TIMEOUT_MS = 30000; // timeout "oficial" pedido pela navegação
const HARD_DEADLINE_MS = 8000; // corte real para não estourar o limite da função
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function detectMarketplace(url) {
  const u = url.toLowerCase();
  if (u.includes('shopee.')) return 'shopee';
  if (u.includes('mercadolivre.') || u.includes('mercadolibre.')) return 'mercadolivre';
  if (u.includes('aliexpress.')) return 'aliexpress';
  if (u.includes('amazon.')) return 'amazon';
  return null;
}

// Corta qualquer promise que ultrapasse o deadline definido,
// evitando que a função trave até o timeout do Vercel (erro 504 "silencioso").
function withDeadline(promise, ms, label = 'operação') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout: ${label} excedeu ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function launchBrowser() {
  console.log('[scrape] Resolvendo executablePath do chromium...');

  // Em ambiente serverless (Vercel) usamos o binário empacotado do @sparticuz/chromium.
  // Em desenvolvimento local, deixamos o Playwright usar seu próprio Chromium (executablePath undefined).
  const isLocalDev = !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME;

  const executablePath = isLocalDev ? undefined : await chromium.executablePath();

  console.log('[scrape] executablePath:', executablePath || '(playwright padrão - dev local)');

  const browser = await playwright.launch({
    args: isLocalDev ? [] : chromium.args,
    executablePath,
    headless: true,
  });

  console.log('[scrape] Browser iniciado com sucesso.');
  return browser;
}

// ---------------------------------------------------------------------------
// Funções de scraping por marketplace
// Cada uma recebe a `page` já navegada e retorna o objeto do produto.
// ---------------------------------------------------------------------------

async function scrapeShopee(page) {
  console.log('[scrape][shopee] Extraindo dados...');
  const product = await page.evaluate(() => {
    const getMeta = (name) =>
      document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
      null;

    return {
      title: getMeta('og:title') || document.title,
      image: getMeta('og:image'),
      description: getMeta('og:description'),
      price: document.querySelector('[class*="price"]')?.textContent?.trim() || null,
    };
  });
  return product;
}

async function scrapeMercadoLivre(page) {
  console.log('[scrape][mercadolivre] Extraindo dados...');
  const product = await page.evaluate(() => {
    const getMeta = (name) =>
      document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
      null;

    return {
      title: getMeta('og:title') || document.title,
      image: getMeta('og:image'),
      description: getMeta('og:description'),
      price:
        document.querySelector('.andes-money-amount__fraction')?.textContent?.trim() ||
        document.querySelector('[class*="price-tag-fraction"]')?.textContent?.trim() ||
        null,
    };
  });
  return product;
}

async function scrapeAliExpress(page) {
  console.log('[scrape][aliexpress] Extraindo dados...');
  const product = await page.evaluate(() => {
    const getMeta = (name) =>
      document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
      null;

    return {
      title: getMeta('og:title') || document.title,
      image: getMeta('og:image'),
      description: getMeta('og:description'),
      price:
        document.querySelector('[class*="price-default"]')?.textContent?.trim() ||
        document.querySelector('[class*="Price"]')?.textContent?.trim() ||
        null,
    };
  });
  return product;
}

async function scrapeAmazon(page) {
  console.log('[scrape][amazon] Extraindo dados...');
  const product = await page.evaluate(() => {
    const getMeta = (name) =>
      document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
      null;

    return {
      title: document.querySelector('#productTitle')?.textContent?.trim() || getMeta('og:title') || document.title,
      image:
        document.querySelector('#landingImage')?.getAttribute('src') ||
        getMeta('og:image') ||
        null,
      description: getMeta('og:description'),
      price:
        document.querySelector('.a-price .a-offscreen')?.textContent?.trim() ||
        document.querySelector('#priceblock_ourprice')?.textContent?.trim() ||
        null,
    };
  });
  return product;
}

const scrapers = {
  shopee: scrapeShopee,
  mercadolivre: scrapeMercadoLivre,
  aliexpress: scrapeAliExpress,
  amazon: scrapeAmazon,
};

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const startedAt = Date.now();
  const { url } = req.query;

  console.log('[scrape] Requisição recebida. URL:', url);

  if (!url) {
    console.warn('[scrape] Parâmetro "url" ausente.');
    return res.status(400).json({
      success: false,
      error: 'Parâmetro "url" é obrigatório. Uso: /api/scrape?url=PRODUCT_URL',
    });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    console.warn('[scrape] URL inválida:', url);
    return res.status(400).json({ success: false, error: 'URL inválida.' });
  }

  const marketplace = detectMarketplace(parsedUrl.href);
  if (!marketplace) {
    console.warn('[scrape] Marketplace não suportado para URL:', url);
    return res.status(400).json({
      success: false,
      error: 'Marketplace não suportado. Use Shopee, Mercado Livre, AliExpress ou Amazon.',
    });
  }

  console.log('[scrape] Marketplace detectado:', marketplace);

  let browser;
  try {
    browser = await withDeadline(launchBrowser(), 5000, 'inicialização do browser');

    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });

    const page = await context.newPage();

    console.log('[scrape] Navegando até:', parsedUrl.href);

    await withDeadline(
      page.goto(parsedUrl.href, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS,
      }),
      HARD_DEADLINE_MS,
      'navegação da página'
    );

    const scraperFn = scrapers[marketplace];
    const product = await withDeadline(scraperFn(page), 3000, `extração de dados (${marketplace})`);

    console.log('[scrape] Produto extraído com sucesso em', Date.now() - startedAt, 'ms');

    return res.status(200).json({
      success: true,
      marketplace,
      product,
    });
  } catch (error) {
    console.error('[scrape] Erro durante o scraping:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro desconhecido durante o scraping.',
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log('[scrape] Browser encerrado.');
      } catch (closeErr) {
        console.error('[scrape] Erro ao fechar browser:', closeErr?.message || closeErr);
      }
    }
    console.log('[scrape] Tempo total:', Date.now() - startedAt, 'ms');
  }
}
