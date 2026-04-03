import axios from "axios";
import * as cheerio from "cheerio";

// ============================================================
// Proxy configuration - read from environment
// Set PROXY_URL=http://user:pass@host:port or http://host:port
// ============================================================
function buildProxyConfig(): { protocol: string; host: string; port: number; auth?: { username: string; password: string } } | undefined {
  const raw = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY || "";
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const config: { protocol: string; host: string; port: number; auth?: { username: string; password: string } } = {
      protocol: u.protocol.replace(":", ""),
      host: u.hostname,
      port: parseInt(u.port || "80", 10),
    };
    if (u.username) {
      config.auth = { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
    }
    return config;
  } catch {
    return undefined;
  }
}

const PROXY_CONFIG = buildProxyConfig();

// ============================================================
// Amazon marketplace domains
// ============================================================
export const MARKETPLACES: Record<string, { domain: string; name: string; flag: string; lang: string }> = {
  US: { domain: "www.amazon.com", name: "美国", flag: "🇺🇸", lang: "en-US,en;q=0.9" },
  UK: { domain: "www.amazon.co.uk", name: "英国", flag: "🇬🇧", lang: "en-GB,en;q=0.9" },
  DE: { domain: "www.amazon.de", name: "德国", flag: "🇩🇪", lang: "de-DE,de;q=0.9,en;q=0.8" },
  FR: { domain: "www.amazon.fr", name: "法国", flag: "🇫🇷", lang: "fr-FR,fr;q=0.9,en;q=0.8" },
  IT: { domain: "www.amazon.it", name: "意大利", flag: "🇮🇹", lang: "it-IT,it;q=0.9,en;q=0.8" },
  ES: { domain: "www.amazon.es", name: "西班牙", flag: "🇪🇸", lang: "es-ES,es;q=0.9,en;q=0.8" },
  JP: { domain: "www.amazon.co.jp", name: "日本", flag: "🇯🇵", lang: "ja-JP,ja;q=0.9,en;q=0.8" },
  CA: { domain: "www.amazon.ca", name: "加拿大", flag: "🇨🇦", lang: "en-CA,en;q=0.9" },
  AU: { domain: "www.amazon.com.au", name: "澳大利亚", flag: "🇦🇺", lang: "en-AU,en;q=0.9" },
  IN: { domain: "www.amazon.in", name: "印度", flag: "🇮🇳", lang: "en-IN,en;q=0.9,hi;q=0.8" },
  MX: { domain: "www.amazon.com.mx", name: "墨西哥", flag: "🇲🇽", lang: "es-MX,es;q=0.9,en;q=0.8" },
  BR: { domain: "www.amazon.com.br", name: "巴西", flag: "🇧🇷", lang: "pt-BR,pt;q=0.9,en;q=0.8" },
  SG: { domain: "www.amazon.sg", name: "新加坡", flag: "🇸🇬", lang: "en-SG,en;q=0.9" },
  AE: { domain: "www.amazon.ae", name: "阿联酋", flag: "🇦🇪", lang: "en-AE,en;q=0.9,ar;q=0.8" },
  SA: { domain: "www.amazon.sa", name: "沙特阿拉伯", flag: "🇸🇦", lang: "ar-SA,ar;q=0.9,en;q=0.8" },
  NL: { domain: "www.amazon.nl", name: "荷兰", flag: "🇳🇱", lang: "nl-NL,nl;q=0.9,en;q=0.8" },
  SE: { domain: "www.amazon.se", name: "瑞典", flag: "🇸🇪", lang: "sv-SE,sv;q=0.9,en;q=0.8" },
  PL: { domain: "www.amazon.pl", name: "波兰", flag: "🇵🇱", lang: "pl-PL,pl;q=0.9,en;q=0.8" },
  BE: { domain: "www.amazon.com.be", name: "比利时", flag: "🇧🇪", lang: "nl-BE,nl;q=0.9,fr;q=0.8,en;q=0.7" },
  TR: { domain: "www.amazon.com.tr", name: "土耳其", flag: "🇹🇷", lang: "tr-TR,tr;q=0.9,en;q=0.8" },
};

// ============================================================
// Browser fingerprint profiles - each profile is a coherent
// combination of UA + platform + sec-ch-ua headers that a real
// browser would send together.
// ============================================================
interface BrowserProfile {
  userAgent: string;
  platform: string;
  secChUa: string;
  secChUaPlatform: string;
  secChUaMobile: string;
}

const BROWSER_PROFILES: BrowserProfile[] = [
  // Chrome 134 on Windows 11
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    platform: "Win32",
    secChUa: '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="99"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: "?0",
  },
  // Chrome 133 on Windows 10
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    platform: "Win32",
    secChUa: '"Google Chrome";v="133", "Chromium";v="133", "Not:A-Brand";v="99"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: "?0",
  },
  // Chrome 134 on macOS Sequoia
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    platform: "MacIntel",
    secChUa: '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="99"',
    secChUaPlatform: '"macOS"',
    secChUaMobile: "?0",
  },
  // Chrome 133 on macOS
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    platform: "MacIntel",
    secChUa: '"Google Chrome";v="133", "Chromium";v="133", "Not:A-Brand";v="99"',
    secChUaPlatform: '"macOS"',
    secChUaMobile: "?0",
  },
  // Edge 134 on Windows
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
    platform: "Win32",
    secChUa: '"Microsoft Edge";v="134", "Chromium";v="134", "Not:A-Brand";v="99"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: "?0",
  },
  // Edge 133 on Windows
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0",
    platform: "Win32",
    secChUa: '"Microsoft Edge";v="133", "Chromium";v="133", "Not:A-Brand";v="99"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: "?0",
  },
  // Chrome 134 on Linux
  {
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    platform: "Linux x86_64",
    secChUa: '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="99"',
    secChUaPlatform: '"Linux"',
    secChUaMobile: "?0",
  },
  // Firefox 136 on Windows (no sec-ch-ua for Firefox)
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0",
    platform: "Win32",
    secChUa: "",
    secChUaPlatform: "",
    secChUaMobile: "",
  },
  // Firefox 136 on macOS
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:136.0) Gecko/20100101 Firefox/136.0",
    platform: "MacIntel",
    secChUa: "",
    secChUaPlatform: "",
    secChUaMobile: "",
  },
  // Safari 18.3 on macOS Sequoia
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
    platform: "MacIntel",
    secChUa: "",
    secChUaPlatform: "",
    secChUaMobile: "",
  },
  // Chrome 132 on Windows (slight lag for realism)
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    platform: "Win32",
    secChUa: '"Google Chrome";v="132", "Chromium";v="132", "Not:A-Brand";v="99"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: "?0",
  },
  // Chrome 134 on Windows ARM
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; ARM64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    platform: "Win32",
    secChUa: '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="99"',
    secChUaPlatform: '"Windows"',
    secChUaMobile: "?0",
  },
];

// ============================================================
// Session manager - maintains cookie jars per marketplace to
// simulate persistent browser sessions.
// ============================================================
interface SessionState {
  cookies: Record<string, string>;
  profile: BrowserProfile;
  lastRequestTime: number;
  requestCount: number;
  initialized: boolean;
  // Token bucket for rate limiting: max requests per window
  tokenBucket: number;
  lastTokenRefill: number;
}

// Rate limiter constants
// With parallel product+reviews fetching per ASIN, each ASIN consumes 2 tokens.
// BATCH_SIZE=3 ASINs × 2 requests = 6 requests burst max.
// Capacity of 8 allows the burst, refill keeps steady-state rate safe.
const TOKEN_BUCKET_CAPACITY = parseInt(process.env.SCRAPER_BUCKET_CAPACITY || "8");
const TOKEN_REFILL_RATE_MS = parseInt(process.env.SCRAPER_REFILL_MS || "3000"); // 1 token per 3s
const MIN_REQUEST_INTERVAL_MS = parseInt(process.env.SCRAPER_MIN_INTERVAL_MS || "1200");

const sessions: Map<string, SessionState> = new Map();

function getSession(marketplace: string): SessionState {
  if (!sessions.has(marketplace)) {
    sessions.set(marketplace, {
      cookies: {},
      profile: BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)],
      lastRequestTime: 0,
      requestCount: 0,
      initialized: false,
      tokenBucket: TOKEN_BUCKET_CAPACITY,
      lastTokenRefill: Date.now(),
    });
  }
  return sessions.get(marketplace)!;
}

/**
 * Token bucket rate limiter - waits until a request token is available.
 * Prevents bursting too many requests at once to the same marketplace.
 */
async function acquireRateLimit(session: SessionState): Promise<void> {
  // Refill tokens based on elapsed time
  const now = Date.now();
  const elapsed = now - session.lastTokenRefill;
  const tokensToAdd = Math.floor(elapsed / TOKEN_REFILL_RATE_MS);
  if (tokensToAdd > 0) {
    session.tokenBucket = Math.min(TOKEN_BUCKET_CAPACITY, session.tokenBucket + tokensToAdd);
    session.lastTokenRefill = now - (elapsed % TOKEN_REFILL_RATE_MS);
  }

  // Enforce absolute minimum interval between requests
  const sinceLastRequest = Date.now() - session.lastRequestTime;
  if (sinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    await delay(MIN_REQUEST_INTERVAL_MS - sinceLastRequest + Math.random() * 500);
  }

  // Wait for a token to be available
  while (session.tokenBucket < 1) {
    await delay(TOKEN_REFILL_RATE_MS / 2);
    const now2 = Date.now();
    const elapsed2 = now2 - session.lastTokenRefill;
    const add = Math.floor(elapsed2 / TOKEN_REFILL_RATE_MS);
    if (add > 0) {
      session.tokenBucket = Math.min(TOKEN_BUCKET_CAPACITY, session.tokenBucket + add);
      session.lastTokenRefill = now2 - (elapsed2 % TOKEN_REFILL_RATE_MS);
    }
  }

  session.tokenBucket -= 1;
}

/**
 * Parse Set-Cookie headers and merge into session cookie jar.
 */
function mergeCookies(session: SessionState, setCookieHeaders: string | string[] | undefined) {
  if (!setCookieHeaders) return;
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const h of headers) {
    const nameValue = h.split(";")[0];
    if (!nameValue) continue;
    const eqIdx = nameValue.indexOf("=");
    if (eqIdx < 1) continue;
    const name = nameValue.substring(0, eqIdx).trim();
    const value = nameValue.substring(eqIdx + 1).trim();
    session.cookies[name] = value;
  }
}

function cookieString(session: SessionState): string {
  return Object.entries(session.cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ============================================================
// Delay helpers
// ============================================================
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Human-like random delay: base ± jitter, with occasional longer pauses. */
function humanDelay(baseMs: number, jitterMs: number): Promise<void> {
  // 10% chance of a longer "thinking" pause
  const extra = Math.random() < 0.10 ? 2000 + Math.random() * 3000 : 0;
  const ms = baseMs + (Math.random() * 2 - 1) * jitterMs + extra;
  return delay(Math.max(500, ms));
}

// ============================================================
// Build request headers that match the chosen browser profile
// ============================================================
function buildHeaders(session: SessionState, marketplace: string, referer?: string): Record<string, string> {
  const mp = MARKETPLACES[marketplace];
  const profile = session.profile;
  const isChromium = profile.secChUa !== "";

  const headers: Record<string, string> = {
    "User-Agent": profile.userAgent,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": mp.lang,
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "max-age=0",
  };

  // Chromium-specific headers
  if (isChromium) {
    headers["sec-ch-ua"] = profile.secChUa;
    headers["sec-ch-ua-mobile"] = profile.secChUaMobile;
    headers["sec-ch-ua-platform"] = profile.secChUaPlatform;
    headers["Sec-Fetch-Dest"] = "document";
    headers["Sec-Fetch-Mode"] = "navigate";
    headers["Sec-Fetch-Site"] = referer ? "same-origin" : "none";
    headers["Sec-Fetch-User"] = "?1";
  }

  // Referer - simulate navigation from Amazon homepage or search
  if (referer) {
    headers["Referer"] = referer;
  }

  // Cookies
  const ck = cookieString(session);
  if (ck) {
    headers["Cookie"] = ck;
  }

  return headers;
}

// ============================================================
// CAPTCHA / bot detection helpers
// ============================================================
function isCaptchaPage(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("captcha") ||
    lower.includes("robot check") ||
    lower.includes("type the characters you see") ||
    lower.includes("sorry, we just need to make sure") ||
    lower.includes("enter the characters you see below") ||
    lower.includes("api-services-support@amazon.com")
  );
}

function isDogPage(html: string): boolean {
  // Amazon sometimes shows a "sorry" page with a dog image
  const lower = html.toLowerCase();
  return (
    (lower.includes("sorry") && lower.includes("dogs of amazon")) ||
    lower.includes("ref=cs_503_link")
  );
}

// ============================================================
// Warm up session: visit the Amazon homepage first to collect
// cookies (session-id, i18n-prefs, etc.) just like a real
// browser would before navigating to a product page.
// ============================================================
async function warmUpSession(marketplace: string): Promise<void> {
  const session = getSession(marketplace);
  if (session.initialized) return;

  const mp = MARKETPLACES[marketplace];
  if (!mp) return;

  const url = `https://${mp.domain}/`;
  const headers = buildHeaders(session, marketplace);

  try {
    const resp = await axios.get(url, {
      headers,
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: () => true,
      transformResponse: [(data) => data],
      ...(PROXY_CONFIG ? { proxy: PROXY_CONFIG } : {}),
    });

    // Collect cookies from response
    mergeCookies(session, resp.headers["set-cookie"]);
    session.initialized = true;
    session.lastRequestTime = Date.now();

    // Small pause after homepage visit
    await humanDelay(1500, 800);
  } catch {
    // Non-fatal: we can still try product pages without warm-up
    console.warn(`[Scraper] Failed to warm up session for ${marketplace}`);
  }
}

// ============================================================
// Fetch a single product page with retry logic
// ============================================================
const MAX_RETRIES = 3;
const RETRY_DELAYS = [3000, 6000, 12000]; // exponential-ish backoff

async function fetchProductPage(asin: string, marketplace: string): Promise<string> {
  const mp = MARKETPLACES[marketplace];
  if (!mp) {
    throw new Error(`Unknown marketplace: ${marketplace}`);
  }

  const session = getSession(marketplace);

  // Ensure session is warmed up
  await warmUpSession(marketplace);

  const productUrl = `https://${mp.domain}/dp/${asin}`;
  // Simulate coming from Amazon search results or homepage
  const referers = [
    `https://${mp.domain}/s?k=${asin}`,
    `https://${mp.domain}/`,
    `https://${mp.domain}/s?k=${asin}&ref=nb_sb_noss`,
    `https://${mp.domain}/gp/bestsellers/`,
  ];

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // On retries, rotate the browser profile for a fresh fingerprint
    if (attempt > 0) {
      session.profile = BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
      await delay(RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)] + Math.random() * 2000);
    }

    // Token bucket rate limiting
    await acquireRateLimit(session);

    const referer = referers[Math.floor(Math.random() * referers.length)];
    const headers = buildHeaders(session, marketplace, referer);

    try {
      const response = await axios.get(productUrl, {
        headers,
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
        decompress: true,
        ...(PROXY_CONFIG ? { proxy: PROXY_CONFIG } : {}),
      });

      session.lastRequestTime = Date.now();
      session.requestCount++;

      // Collect cookies
      mergeCookies(session, response.headers["set-cookie"]);

      if (response.status === 404) {
        throw new Error(`产品不存在或ASIN无效 (${asin})，请检查ASIN是否正确`);
      }

      if (response.status === 503 || isDogPage(response.data)) {
        lastError = new Error("Amazon服务暂时不可用(503)，正在重试...");
        continue; // retry
      }

      if (response.status !== 200) {
        lastError = new Error(`HTTP ${response.status} for ASIN: ${asin}`);
        continue; // retry
      }

      const html = typeof response.data === "string" ? response.data : String(response.data);

      // Check for CAPTCHA
      if (isCaptchaPage(html)) {
        lastError = new Error("检测到CAPTCHA验证页面");
        // Reset session cookies on CAPTCHA - start fresh
        session.cookies = {};
        session.initialized = false;
        continue; // retry with fresh session
      }

      return html;
    } catch (error: any) {
      lastError = error;
      if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
        // Network errors are retryable
        continue;
      }
      // For other errors (like 404), don't retry
      if (error.message?.includes("not found")) {
        throw error;
      }
    }
  }

  throw lastError || new Error(`Failed to fetch product page after ${MAX_RETRIES + 1} attempts`);
}

// ============================================================
// Product data types
// ============================================================
export interface BestSellerRank {
  mainCategory: string | null;      // e.g. "Kitchen & Dining"
  mainRank: number | null;           // e.g. 72186
  subCategory: string | null;        // e.g. "Compact Refrigerators"
  subRank: number | null;            // e.g. 146
  rawText: string | null;            // full raw BSR text for reference
}

export interface CustomerReviews {
  customersSay: string | null;       // summary text from "Customers say" section
  reviewImages: string[];            // up to 10 image URLs from "Reviews with images"
  selectToLearnMore: string[];       // list items from "Select to learn more" section
}

export interface ScrapedProduct {
  asin: string;
  marketplace: string;
  url: string;
  title: string | null;
  brand: string | null;
  price: string | null;
  rating: string | null;
  reviewCount: string | null;
  availability: string | null;
  bulletPoints: string[];
  description: string | null;
  mainImage: string | null;
  images: string[];
  specifications: Record<string, string>;
  productDetails: Record<string, string>;
  categories: string | null;         // breadcrumb path e.g. "Home & Kitchen > ..."
  seller: string | null;
  bestSellerRank: BestSellerRank;    // parsed BSR data
  customerReviews: CustomerReviews;  // customer reviews section
  status: "success" | "failed";
  errorMessage: string | null;
}

// ============================================================
// Text sanitization helpers
// ============================================================

/**
 * Remove embedded JavaScript code and normalize whitespace from scraped text.
 * Amazon pages sometimes include inline <script> content that leaks into
 * text() calls when the DOM parser picks up script siblings.
 */
function cleanText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    // Remove P.when(...) Amazon async loader blocks
    .replace(/P\.when\([^)]*\)[^;]*;?/g, "")
    // Remove full function bodies
    .replace(/function\s*\([^)]*\)\s*\{[^}]*\}/g, "")
    // Remove var/let/const assignments
    .replace(/(?:var|let|const)\s+\w+\s*=[^;]+;/g, "")
    // Remove A.declarative(...) calls
    .replace(/A\.declarative\([\s\S]*?\);/g, "")
    // Remove if(window.ue) blocks
    .replace(/if\s*\(window\.ue\)[\s\S]*?\}/g, "")
    // Remove ue.count(...) calls
    .replace(/ue\.count\([^)]*\)/g, "")
    // Remove window.* and document.* references
    .replace(/(?:window|document)\.\w+(?:\.\w+)*/g, "")
    // Remove dpAcr* variable references
    .replace(/dpAcr\w+/g, "")
    // Remove standalone JS identifiers that look like variable names (camelCase)
    .replace(/\b[a-z][a-zA-Z]{4,}(?:Has|Is|Should|Can|Will)[A-Z]\w*/g, "")
    // Collapse multiple whitespace/newlines into single space
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

/**
 * Clean a key-value record by sanitizing both keys and values.
 */
function cleanRecord(record: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    const cleanKey = cleanText(k);
    const cleanVal = cleanText(v);
    if (cleanKey && cleanVal) {
      result[cleanKey] = cleanVal;
    }
  }
  return result;
}

// ============================================================
// Parse product data from HTML
// ============================================================
function parseProductPage(html: string, asin: string, marketplace: string): ScrapedProduct {
  const $ = cheerio.load(html);
  const mp = MARKETPLACES[marketplace];
  const url = `https://${mp.domain}/dp/${asin}`;

  // Extract script content BEFORE removing scripts (used later for image JSON extraction)
  const scriptContent = $("script").text();

  // Remove all script tags from the entire document first to prevent JS leakage
  $("script").remove();
  $("style").remove();

  // Title
  const title = cleanText($("#productTitle").text()) || cleanText($("h1#title span").text()) || null;

  // Brand
  const rawBrand =
    $("#bylineInfo").text().trim().replace(/^(Visit the |Brand: |Store: )/, "").replace(/ Store$/, "") ||
    $("a#bylineInfo").text().trim().replace(/^(Visit the |Brand: |Store: )/, "").replace(/ Store$/, "") ||
    "";
  const brand = cleanText(rawBrand);

  // Price
  const price =
    $(".a-price .a-offscreen").first().text().trim() ||
    $("#priceblock_ourprice").text().trim() ||
    $("#priceblock_dealprice").text().trim() ||
    $("span.a-price-whole").first().parent().find(".a-offscreen").text().trim() ||
    null;

  // Rating - extract only the numeric rating (e.g. "4.7 out of 5 stars" -> "4.7")
  const rawRating =
    $("span.a-icon-alt").first().text().trim() ||
    $("#acrPopover .a-icon-alt").text().trim() ||
    $("[data-hook='average-star-rating'] .a-icon-alt").text().trim() ||
    null;
  const ratingMatch = rawRating?.match(/([\d.]+)\s*out of/i) || rawRating?.match(/^([\d.]+)/);
  const rating = ratingMatch ? ratingMatch[1] : cleanText(rawRating);

  // Review count
  const rawReviewCount =
    $("#acrCustomerReviewText").text().trim() ||
    $("span[data-hook='total-review-count']").text().trim() ||
    null;
  const reviewCount = cleanText(rawReviewCount);

  // Availability
  const rawAvailability =
    $("#availability span").first().text().trim() ||
    $("#availability").text().trim() ||
    null;
  const availability = cleanText(rawAvailability);

  // Bullet points (feature list / five points)
  const bulletPoints: string[] = [];
  $("#feature-bullets ul li span.a-list-item").each((_, el) => {
    const text = cleanText($(el).text());
    if (text && !text.includes("›") && text.length > 2) {
      bulletPoints.push(text);
    }
  });
  if (bulletPoints.length === 0) {
    $("#feature-bullets .a-unordered-list .a-list-item").each((_, el) => {
      const text = cleanText($(el).text());
      if (text && !text.includes("›") && text.length > 2) {
        bulletPoints.push(text);
      }
    });
  }

  // Product description
  let description =
    cleanText($("#productDescription p").text()) ||
    cleanText($("#productDescription").text()) ||
    cleanText($("#productDescription_feature_div").text()) ||
    null;
  if (description && description.length < 10) description = null;

  // Main image
  let mainImage: string | null = null;
  const landingImg = $("#landingImage, #imgBlkFront");
  if (landingImg.length > 0) {
    mainImage = landingImg.attr("data-old-hires") || null;
    if (!mainImage) {
      const dynamicImage = landingImg.attr("data-a-dynamic-image");
      if (dynamicImage) {
        try {
          const imgObj = JSON.parse(dynamicImage);
          const urls = Object.keys(imgObj);
          mainImage = urls.reduce((best, url) => {
            const dims = imgObj[url];
            const bestDims = imgObj[best];
            return dims[0] * dims[1] > bestDims[0] * bestDims[1] ? url : best;
          }, urls[0]);
        } catch {
          mainImage = null;
        }
      }
    }
    if (!mainImage) {
      mainImage = landingImg.attr("src") || null;
    }
  }

  // All images (scriptContent extracted before script removal above)
  const images: string[] = [];
  const imageRegex = /"hiRes"\s*:\s*"(https:\/\/[^"]+)"/g;
  let match;
  while ((match = imageRegex.exec(scriptContent)) !== null) {
    if (match[1] && !images.includes(match[1])) {
      images.push(match[1]);
    }
  }
  if (images.length === 0) {
    $("#altImages .a-spacing-small img, #imageBlock img").each((_, el) => {
      let src = $(el).attr("src") || "";
      src = src.replace(/\._[A-Z0-9_]+_\./, ".");
      if (src && src.startsWith("http") && !images.includes(src) && !src.includes("sprite")) {
        images.push(src);
      }
    });
  }

  // Specifications
  const rawSpecifications: Record<string, string> = {};
  $("#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr").each((_, el) => {
    const key = $(el).find("th").text().trim();
    const value = $(el).find("td").text().trim();
    if (key && value) {
      rawSpecifications[key] = value;
    }
  });
  $("table.a-keyvalue tr, #prodDetails table tr").each((_, el) => {
    const key = $(el).find("th, td:first-child").first().text().trim();
    const value = $(el).find("td").last().text().trim();
    if (key && value && key !== value) {
      rawSpecifications[key] = value;
    }
  });
  const specifications = cleanRecord(rawSpecifications);

  // Product details
  const rawProductDetails: Record<string, string> = {};
  $("#detailBullets_feature_div li, #productDetails_db_sections .a-section").each((_, el) => {
    const text = $(el).text().trim();
    const parts = text.split(/\s*[:\uff1a]\s*/);
    if (parts.length >= 2) {
      const key = parts[0].replace(/[^\w\s\u4e00-\u9fff]/g, "").trim();
      const value = parts.slice(1).join(":").trim();
      if (key && value) {
        rawProductDetails[key] = value;
      }
    }
  });
  $("#detailBulletsWrapper_feature_div li").each((_, el) => {
    const spans = $(el).find("span span");
    if (spans.length >= 2) {
      const key = $(spans[0]).text().replace(/[:\uff1a\s]+$/, "").trim();
      const value = $(spans[1]).text().trim();
      if (key && value) {
        rawProductDetails[key] = value;
      }
    }
  });
  const productDetails = cleanRecord(rawProductDetails);

  // Categories
  const rawCategories =
    $("#wayfinding-breadcrumbs_container a")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(t => t.length > 0)
      .join(" > ") ||
    $("ul.a-unordered-list.a-horizontal.a-size-small a")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(t => t.length > 0)
      .join(" > ") ||
    null;
  const categories = cleanText(rawCategories);

  // Seller
  const rawSeller =
    $("#sellerProfileTriggerId").text().trim() ||
    $("#merchant-info a").first().text().trim() ||
    null;
  const seller = cleanText(rawSeller);

  // ============================================================
  // Best Sellers Rank (BSR) parsing
  // Amazon format: "#72,186 in Kitchen & Dining ... #146 in Compact Refrigerators"
  // ============================================================
  const bestSellerRank: BestSellerRank = {
    mainCategory: null,
    mainRank: null,
    subCategory: null,
    subRank: null,
    rawText: null,
  };

  // Try to find BSR in productDetails or specifications first
  const bsrRawFromDetails =
    productDetails["Best Sellers Rank"] ||
    productDetails["Best-sellers rank"] ||
    productDetails["Amazon Best Sellers Rank"] ||
    specifications["Best Sellers Rank"] ||
    specifications["Best-sellers rank"] ||
    specifications["Amazon Best Sellers Rank"] ||
    null;

  // Also try to find BSR directly in the HTML (before script removal)
  // We need to look in the original DOM for the BSR table row
  let bsrRawText = bsrRawFromDetails;

  // Try to find in detail bullets section
  if (!bsrRawText) {
    $("#detailBulletsWrapper_feature_div li, #productDetails_db_sections li, #productDetails_detailBullets_sections1 tr").each((_, el) => {
      const text = $(el).text();
      if (text.includes("Best Sellers Rank") || text.includes("Best-sellers rank")) {
        bsrRawText = text.replace(/\s+/g, " ").trim();
        return false; // break
      }
    });
  }

  if (!bsrRawText) {
    // Try table rows
    $("table tr, #productDetails_techSpec_section_1 tr").each((_, el) => {
      const thText = $(el).find("th").text();
      if (thText.includes("Best Sellers Rank") || thText.includes("Best-sellers rank")) {
        bsrRawText = $(el).find("td").text().replace(/\s+/g, " ").trim();
        return false;
      }
    });
  }

  if (bsrRawText) {
    bestSellerRank.rawText = bsrRawText;
    // Parse all BSR entries: #NUMBER in CATEGORY NAME
    // Format examples:
    // "#72,186 in Kitchen & Dining (See Top 100 in Kitchen & Dining) #146 in Compact Refrigerators"
    // "#1,234 in Electronics"
    const bsrRegex = /#(\d[\d,]*)\s+in\s+([^#(\n]+?)(?:\s*\(See Top 100 in [^)]+\)|\s*#|$)/g;
    const entries: Array<{ rank: number; category: string }> = [];
    let bsrMatch: RegExpExecArray | null;
    
    while ((bsrMatch = bsrRegex.exec(bsrRawText)) !== null) {
      const rankNum = parseInt(bsrMatch[1].replace(/,/g, ""), 10);
      let catName = bsrMatch[2].trim().replace(/\s+/g, " ");
      
      // Remove trailing parenthetical content that might be captured
      catName = catName.replace(/\s*\([^)]*\)\s*$/, "").trim();
      
      if (!isNaN(rankNum) && catName && catName.length > 0) {
        entries.push({ rank: rankNum, category: catName });
      }
    }
    
    // Assign main and sub categories based on hierarchy
    // Main category is typically the first (broadest) entry
    // Sub category is typically the last (most specific) entry
    if (entries.length === 1) {
      // Only one category - it's the main category
      bestSellerRank.mainCategory = entries[0].category;
      bestSellerRank.mainRank = entries[0].rank;
    } else if (entries.length >= 2) {
      // Multiple entries - first is main, last is sub
      bestSellerRank.mainCategory = entries[0].category;
      bestSellerRank.mainRank = entries[0].rank;
      const last = entries[entries.length - 1];
      bestSellerRank.subCategory = last.category;
      bestSellerRank.subRank = last.rank;
    }
  }

  // ============================================================
  // Customer Reviews section parsing
  // NOTE: Amazon loads most review data via AJAX, so only partial
  // data is available in the initial HTML. We extract what we can.
  // ============================================================
  const customerReviews: CustomerReviews = {
    customersSay: null,
    reviewImages: [],
    selectToLearnMore: [],
  };

  // Customers say - try many possible selectors Amazon uses across page variants
  const customersSayCandidates = [
    // New AI-generated summary
    $("[data-hook='cr-insights-widget-aspects-summary']").text().trim(),
    $("[data-hook='cr-summarization-header']").next("p, div").text().trim(),
    $("[data-hook='cr-lighthouse-summary']").text().trim(),
    // Older format
    $(".cr-lighthouse-term-list-header").next().text().trim(),
    $("#cr-summarization-attributes-list").closest("[data-hook]").prev().text().trim(),
    // Generic fallback
    $("[data-hook='cr-insights-widget']").find("p").first().text().trim(),
    $("#cr-insights-widget").find("p").first().text().trim(),
    $(".cr-insights-widget-aspects-summary").text().trim(),
    // Sometimes in a span/div near the review section
    $("[data-hook='cr-lighthouse-term-list']").prev("p, div").text().trim(),
  ].filter(s => s.length > 20); // must be a meaningful sentence

  if (customersSayCandidates.length > 0) {
    customerReviews.customersSay = cleanText(customersSayCandidates[0]);
  }

  // Reviews with images - collect image URLs (up to 10)
  // Amazon stores review image data in JSON inside <script> tags - parse from original HTML
  const reviewImgSet = new Set<string>();

  // Try to extract from JSON data embedded in page scripts (most reliable)
  const reviewImgRegex = /"thumbnailImage"\s*:\s*"(https:[^"]+)"/g;
  const reviewHiResRegex = /"mediumImage"\s*:\s*"(https:[^"]+)"|"fullImage"\s*:\s*"(https:[^"]+)"/g;
  let reviewMatch;
  while ((reviewMatch = reviewImgRegex.exec(html)) !== null) {
    let src = reviewMatch[1];
    // Convert to higher resolution
    src = src.replace(/\._[A-Z0-9_,]+_\./i, "._SL500_.");
    if (src && !src.includes("sprite") && reviewImgSet.size < 10) {
      reviewImgSet.add(src);
    }
  }
  while ((reviewMatch = reviewHiResRegex.exec(html)) !== null) {
    const src = (reviewMatch[1] || reviewMatch[2] || "").replace(/\._[A-Z0-9_,]+_\./i, "._SL500_.");
    if (src && src.startsWith("http") && !src.includes("sprite") && reviewImgSet.size < 10) {
      reviewImgSet.add(src);
    }
  }

  // Also try DOM selectors (for images already in the HTML)
  $("[data-hook='cr-media-gallery-thumbnail'] img, [data-hook='review-image-tile'] img, .cr-lighthouse-image img, .review-image-tile img").each((_, el) => {
    let src = $(el).attr("src") || $(el).attr("data-src") || "";
    src = src.replace(/\._[A-Z0-9_,]+_\./i, "._SL500_.");
    if (src && src.startsWith("http") && !src.includes("sprite") && reviewImgSet.size < 10) {
      reviewImgSet.add(src);
    }
  });
  $("#cr-mediacustomer-review-images img").each((_, el) => {
    let src = $(el).attr("src") || "";
    src = src.replace(/\._[A-Z0-9_,]+_\./i, "._SL500_.");
    if (src && src.startsWith("http") && !src.includes("sprite") && reviewImgSet.size < 10) {
      reviewImgSet.add(src);
    }
  });
  customerReviews.reviewImages = Array.from(reviewImgSet).slice(0, 10);

  // Select to learn more - aspect labels (Amazon's review insight tags)
  const learnMoreSelectors = [
    ".cr-lighthouse-term",
    "[data-hook='cr-summarization-attribute'] span",
    "#cr-summarization-attributes-list .a-list-item",
    "[data-hook='cr-lighthouse-term-list'] li",
    "[data-hook='cr-insights-widget'] .a-list-item",
    ".cr-insights-widget-aspects-list li",
  ];
  for (const sel of learnMoreSelectors) {
    $(sel).each((_, el) => {
      const text = cleanText($(el).text());
      if (text && text.length > 1 && text.length < 100 && !customerReviews.selectToLearnMore.includes(text)) {
        customerReviews.selectToLearnMore.push(text);
      }
    });
  }

  return {
    asin,
    marketplace,
    url,
    title,
    brand,
    price,
    rating,
    reviewCount,
    availability,
    bulletPoints,
    description,
    mainImage,
    images,
    specifications,
    productDetails,
    categories,
    seller,
    bestSellerRank,
    customerReviews,
    status: "success",
    errorMessage: null,
  };
}

// ============================================================
// Reviews page fetch + parse
// Amazon's /product-reviews/{asin} page has static HTML with
// actual review data, unlike the product page which uses AJAX.
// ============================================================

async function fetchReviewsPage(asin: string, marketplace: string, productUrl: string): Promise<string | null> {
  const mp = MARKETPLACES[marketplace];
  if (!mp) return null;

  const session = getSession(marketplace);
  const reviewsUrl = `https://${mp.domain}/product-reviews/${asin}?reviewerType=all_reviews&sortBy=recent&pageNumber=1`;

  try {
    await acquireRateLimit(session);
    const headers = buildHeaders(session, marketplace, productUrl);

    const response = await axios.get(reviewsUrl, {
      headers,
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500,
      decompress: true,
      ...(PROXY_CONFIG ? { proxy: PROXY_CONFIG } : {}),
    });

    session.lastRequestTime = Date.now();
    mergeCookies(session, response.headers["set-cookie"]);

    if (response.status !== 200) return null;

    const html = typeof response.data === "string" ? response.data : String(response.data);
    if (isCaptchaPage(html) || isDogPage(html)) return null;

    return html;
  } catch {
    return null; // Non-fatal: we still have partial data from product page
  }
}

function parseReviewsPage(html: string): Partial<CustomerReviews> {
  const $ = cheerio.load(html);
  const result: Partial<CustomerReviews> = {
    customersSay: null,
    reviewImages: [],
    selectToLearnMore: [],
  };

  // customersSay - AI-generated summary, more reliably present on the reviews page
  const sayCandidates = [
    $("[data-hook='cr-insights-widget-aspects-summary']").text().trim(),
    $("[data-hook='cr-lighthouse-summary']").text().trim(),
    $(".cr-lighthouse-summary").text().trim(),
    $("[data-hook='cr-summarization-description']").text().trim(),
    $(".a-section.cr-lighthouse-summary-widget p").text().trim(),
    $("[data-hook='cr-insights-widget']").find("p").first().text().trim(),
    $("#cr-insights-widget").find("p").first().text().trim(),
    // Fallback: grab first long review body as a summary signal
    $("[data-hook='review-body'] span").first().text().trim(),
  ].filter(s => s.length > 30);

  if (sayCandidates.length > 0) {
    result.customersSay = cleanText(sayCandidates[0]);
  }

  // Review images - reviews page has static img tags (no AJAX needed)
  const reviewImgSet = new Set<string>();

  // DOM selectors for review image thumbnails
  $(
    "[data-hook='review-image-tile'] img, " +
    ".review-image-tile img, " +
    "[data-hook='cr-media-gallery-thumbnail'] img, " +
    ".cr-media-fullsize-thumbnail img, " +
    ".cr-lighthouse-image img, " +
    "#cm_cr-review_list img[src*='images-amazon'], " +
    "#cm_cr-review_list img[src*='images-na']"
  ).each((_, el) => {
    let src = $(el).attr("src") || $(el).attr("data-src") || "";
    // Upgrade to full-resolution from thumbnail
    src = src.replace(/\._[A-Z0-9_,]+_\./i, "._SL500_.");
    if (src && src.startsWith("http") && !src.includes("sprite") && reviewImgSet.size < 10) {
      reviewImgSet.add(src);
    }
  });

  // Also search raw HTML for embedded JSON image data
  const imgJsonPatterns: RegExp[] = [
    /"thumbnailImage"\s*:\s*"(https:[^"]+)"/g,
    /"imageURL"\s*:\s*"(https:[^"]+)"/g,
    /"large"\s*:\s*"(https:\/\/images[^"]+)"/g,
    /"mediumImage"\s*:\s*"(https:[^"]+)"/g,
  ];
  for (const pattern of imgJsonPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      const src = m[1].replace(/\._[A-Z0-9_,]+_\./i, "._SL500_.");
      if (src && !src.includes("sprite") && reviewImgSet.size < 10) {
        reviewImgSet.add(src);
      }
    }
  }

  result.reviewImages = Array.from(reviewImgSet).slice(0, 10);

  // Select to learn more - aspect insight tags
  const tagsSet = new Set<string>();
  const tagSelectors = [
    ".cr-lighthouse-term",
    "[data-hook='cr-summarization-attribute'] span",
    "[data-hook='cr-summarization-attribute-name']",
    "#cr-summarization-attributes-list .a-list-item",
    "[data-hook='cr-lighthouse-term-list'] li",
    "[data-hook='cr-insights-widget'] .a-list-item",
    ".cr-insights-widget-aspects-list li",
    "[data-hook='cr-summarization-attributes-list'] li",
  ];
  for (const sel of tagSelectors) {
    $(sel).each((_, el) => {
      const text = cleanText($(el).text());
      if (text && text.length > 1 && text.length < 100) {
        tagsSet.add(text);
      }
    });
  }
  result.selectToLearnMore = Array.from(tagsSet).slice(0, 20);

  return result;
}

// ============================================================
// Public API
// ============================================================

/**
 * Scrape a single product by ASIN with full anti-detection.
 */
export async function scrapeProduct(asin: string, marketplace: string): Promise<ScrapedProduct> {
  try {
    const html = await fetchProductPage(asin, marketplace);

    // Start reviews page fetch concurrently while parsing the product page (CPU-bound).
    // We know the reviews URL from ASIN alone, no need to wait for parse first.
    const mp = MARKETPLACES[marketplace];
    const productUrl = `https://${mp?.domain || "www.amazon.com"}/dp/${asin}`;
    const reviewsHtmlPromise = fetchReviewsPage(asin, marketplace, productUrl);

    const product = parseProductPage(html, asin, marketplace);

    if (!product.title && !product.mainImage) {
      if (isCaptchaPage(html)) {
        return {
          ...product,
          status: "failed",
          errorMessage: "被亚马逊反爬虫机制拦截（CAPTCHA），请稍后重试或点击'刷新会话'后重试",
        };
      }
      if (isDogPage(html)) {
        return {
          ...product,
          status: "failed",
          errorMessage: "亚马逊返回了错误页面，该ASIN可能已下架或不存在",
        };
      }
      return {
        ...product,
        status: "failed",
        errorMessage: "未能解析到产品数据，该ASIN可能已下架、不存在或页面结构已变更",
      };
    }

    // Await the reviews fetch that was already running in parallel
    const reviewsHtml = await reviewsHtmlPromise;
    if (reviewsHtml) {
      const reviewData = parseReviewsPage(reviewsHtml);
      // Merge: reviews page data takes priority; product page data fills gaps
      if (reviewData.customersSay) {
        product.customerReviews.customersSay = reviewData.customersSay;
      }
      if (reviewData.reviewImages && reviewData.reviewImages.length > 0) {
        // Merge image sets (reviews page images preferred)
        const merged = new Set([...reviewData.reviewImages, ...product.customerReviews.reviewImages]);
        product.customerReviews.reviewImages = Array.from(merged).slice(0, 10);
      }
      if (reviewData.selectToLearnMore && reviewData.selectToLearnMore.length > 0) {
        product.customerReviews.selectToLearnMore = reviewData.selectToLearnMore;
      }
    }

    return product;
  } catch (error: any) {
    return {
      asin,
      marketplace,
      url: `https://${MARKETPLACES[marketplace]?.domain || "www.amazon.com"}/dp/${asin}`,
      title: null,
      brand: null,
      price: null,
      rating: null,
      reviewCount: null,
      availability: null,
      bulletPoints: [],
      description: null,
      mainImage: null,
      images: [],
      specifications: {},
      productDetails: {},
      categories: null,
      seller: null,
      bestSellerRank: { mainCategory: null, mainRank: null, subCategory: null, subRank: null, rawText: null },
      customerReviews: { customersSay: null, reviewImages: [], selectToLearnMore: [] },
      status: "failed",
      errorMessage: error.message || "抓取失败",
    };
  }
}

/**
 * Batch scrape multiple products with concurrent processing.
 * Processes BATCH_SIZE products in parallel, with token-bucket rate limiting.
 * Failed items are automatically retried once after a cooling period.
 */
export async function scrapeProducts(
  asins: string[],
  marketplace: string,
  onProgress?: (completed: number, total: number, current: ScrapedProduct) => void
): Promise<ScrapedProduct[]> {
  // Default 3 concurrent; raise SCRAPER_CONCURRENCY env var if using proxy IPs
  const BATCH_SIZE = parseInt(process.env.SCRAPER_CONCURRENCY || (PROXY_CONFIG ? "5" : "3"));
  const results: ScrapedProduct[] = new Array(asins.length);
  let completed = 0;

  // ---- First pass ----
  for (let batchStart = 0; batchStart < asins.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, asins.length);
    const batchAsins = asins.slice(batchStart, batchEnd);

    // Staggered start within batch: 0ms, 900ms, 1800ms
    const batchPromises = batchAsins.map(async (asin, idx) => {
      if (idx > 0) await delay(idx * 900 + Math.random() * 400);
      return scrapeProduct(asin.trim(), marketplace);
    });

    const batchResults = await Promise.all(batchPromises);

    for (let i = 0; i < batchResults.length; i++) {
      const product = batchResults[i];
      results[batchStart + i] = product;
      completed++;
      if (onProgress) onProgress(completed, asins.length, product);
    }

    if (batchEnd < asins.length) {
      await humanDelay(2500, 1000);
    }
  }

  // ---- Auto-retry pass: retry failed items once after a cooling period ----
  const failedIndices = results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.status === "failed" && !r.errorMessage?.includes("不存在") && !r.errorMessage?.includes("无效"));

  if (failedIndices.length > 0) {
    console.log(`[Scraper] Auto-retrying ${failedIndices.length} failed ASINs after cooling period...`);
    // Rotate to a fresh browser profile before retry
    const session = getSession(marketplace);
    session.profile = BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
    // Cooling delay scales with number of failures (more failures = likely more aggressive blocking)
    await delay(Math.min(8000 + failedIndices.length * 1500, 25000));

    for (let b = 0; b < failedIndices.length; b += BATCH_SIZE) {
      const chunk = failedIndices.slice(b, b + BATCH_SIZE);
      const retryPromises = chunk.map(async ({ r, i }, idx) => {
        if (idx > 0) await delay(idx * 1200 + Math.random() * 600);
        const retried = await scrapeProduct(r.asin, marketplace);
        return { retried, i };
      });

      const retryResults = await Promise.all(retryPromises);
      for (const { retried, i } of retryResults) {
        results[i] = retried;
        // onProgress not called again for retries to avoid double-counting in UI
      }

      if (b + BATCH_SIZE < failedIndices.length) {
        await humanDelay(3000, 1000);
      }
    }

    const recoveredCount = failedIndices.filter(({ i }) => results[i].status === "success").length;
    if (recoveredCount > 0) {
      console.log(`[Scraper] Auto-retry recovered ${recoveredCount}/${failedIndices.length} items`);
    }
  }

  return results;
}

/**
 * Reset session for a marketplace (useful when user wants to force refresh).
 */
export function resetSession(marketplace?: string) {
  if (marketplace) {
    sessions.delete(marketplace);
  } else {
    sessions.clear();
  }
}
