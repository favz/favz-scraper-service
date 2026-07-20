import chromium from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright-core';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ 
      success: false, 
      error: 'URL parameter is required' 
    });
  }

  console.log('[SCRAPER] Processing URL:', url);

  
  try {
    // Launch browser
    browser = await playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
        const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    // Navigate to URL with timeout
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    // Wait a bit for dynamic content
    await page.waitForTimeout(3000);

    // Detect marketplace
    const marketplace = detectMarketplace(url);
    let productData = {};

    // Scrape based on marketplace
    switch (marketplace) {
      case 'shopee':
        productData = await scrapeShopee(page);
        break;
      case 'mercadolivre':
        productData = await scrapeMercadoLivre(page);
        break;
      case 'aliexpress':
        productData = await scrapeAliExpress(page);
        break;
      case 'amazon':
        productData = await scrapeAmazon(page);
        break;
      default:
        productData = await scrapeGeneric(page);
    }

    await browser.close();

    console.log('[SCRAPER] Success:', productData);

    return res.status(200).json({
      success: true,
      marketplace,
      product: productData
    });

  } catch (error) {
    console.error('[SCRAPER] Error:', error);
    
    if (browser) {
      await browser.close();
    }

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Detect marketplace
function detectMarketplace(url) {
  if (/shopee\.com/i.test(url)) return 'shopee';
  if (/mercadolivre|mercadolibre|mlb\.la/i.test(url)) return 'mercadolivre';
  if (/aliexpress/i.test(url)) return 'aliexpress';
  if (/amazon/i.test(url)) return 'amazon';
  return 'generic';
}

// Shopee scraper
async function scrapeShopee(page) {
  try {
    const name = await page.textContent('.WBVL_7').catch(() => '');
    const priceText = await page.textContent('.pqTWkA').catch(() => '0');
    const price = priceText.replace(/[^0-9,]/g, '').replace(',', '.');
    const image = await page.getAttribute('.hnaPHt img', 'src').catch(() => '');
    
    return {
      name: name || 'Produto da Shopee',
      price,
      image,
      brand: '',
      seller: '',
      rating: 0
    };
  } catch (error) {
    return { name: 'Produto da Shopee', price: '', image: '' };
  }
}

// Mercado Livre scraper
async function scrapeMercadoLivre(page) {
  try {
    const name = await page.textContent('h1.ui-pdp-title').catch(() => '');
    const priceText = await page.textContent('.andes-money-amount__fraction').catch(() => '0');
    const image = await page.getAttribute('.ui-pdp-image', 'src').catch(() => '');
    
    return {
      name: name || 'Produto do Mercado Livre',
      price: priceText,
      image,
      brand: '',
      seller: '',
      rating: 0
    };
  } catch (error) {
    return { name: 'Produto do Mercado Livre', price: '', image: '' };
  }
}

// AliExpress scraper
async function scrapeAliExpress(page) {
  try {
    const name = await page.textContent('h1').catch(() => '');
    const priceText = await page.textContent('.product-price-value').catch(() => '0');
    const image = await page.getAttribute('.magnifier-image', 'src').catch(() => '');
    
    return {
      name: name || 'Produto do AliExpress',
      price: priceText,
      image,
      brand: '',
      seller: '',
      rating: 0
    };
  } catch (error) {
    return { name: 'Produto do AliExpress', price: '', image: '' };
  }
}

// Amazon scraper
async function scrapeAmazon(page) {
  try {
    const name = await page.textContent('#productTitle').catch(() => '');
    const priceText = await page.textContent('.a-price-whole').catch(() => '0');
    const image = await page.getAttribute('#landingImage', 'src').catch(() => '');
    
    return {
      name: name.trim() || 'Produto da Amazon',
      price: priceText.trim(),
      image,
      brand: '',
      seller: '',
      rating: 0
    };
  } catch (error) {
    return { name: 'Produto da Amazon', price: '', image: '' };
  }
}

// Generic scraper
async function scrapeGeneric(page) {
  try {
    const title = await page.title();
    return {
      name: title || 'Produto',
      price: '',
      image: '',
      brand: '',
      seller: '',
      rating: 0
    };
  } catch (error) {
    return { name: 'Produto', price: '', image: '' };
  }
}
