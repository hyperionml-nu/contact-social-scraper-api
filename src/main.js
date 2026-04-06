import { createServer } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { CheerioCrawler } from '@crawlee/cheerio';
import { Actor } from 'apify';
import log from '@apify/log';

const DEFAULT_MAX_PAGES_PER_DOMAIN = 10;

function getRootDomain(url) {
    const hostname = new URL(url).hostname.toLowerCase();
    const parts = hostname.split('.');

    if (hostname.endsWith('.co.uk')) {
        return parts.slice(-3).join('.');
    }

    return parts.length > 2 ? parts.slice(-2).join('.') : hostname;
}

function isValidEmail(email) {
    const strict = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,10}$/i;
    return strict.test(email) && email.length <= 254;
}

function normalizePhone(raw) {
    return raw.trim().replace(/\s+/g, ' ');
}

function isValidPhone(raw) {
    const digits = raw.replace(/\D/g, '');

    if (digits.length < 10 || digits.length > 15) return false;
    if (/^\d+$/.test(raw)) return false;
    if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(raw)) return false;

    return true;
}

function sanitizeSocialUrl(url) {
    if (!url) return null;

    const trimmed = url.trim();
    const lower = trimmed.toLowerCase();
    const blockedContains = [
        'help.facebook.com',
        'support.twitter.com',
        'help.twitter.com',
        'facebook.com/help',
        'twitter.com/i/',
        'x.com/i/',
        'intent/tweet',
        'share?',
        'sharer.php',
        'facebook.com/sharer',
        'linkedin.com/share',
        'youtube.com/share',
        'privacy',
        'terms',
        'policies',
    ];

    if (blockedContains.some((value) => lower.includes(value))) return null;
    if (/facebook\.com\/(sharer|share|dialog)\b/i.test(trimmed)) return null;

    return trimmed;
}

function toResultPayload(site) {
    return {
        domain: site.domain,
        emails: [...site.emails],
        phones: [...site.phones],
        contactPage: site.contactPage,
        aboutPage: site.aboutPage,
        facebook: site.facebook,
        instagram: site.instagram,
        linkedin: site.linkedin,
        twitter: site.twitter,
        youtube: site.youtube,
    };
}

function normalizeStartUrls(startUrls) {
    if (!Array.isArray(startUrls)) return [];

    return startUrls
        .map((entry) => {
            if (typeof entry === 'string') return { url: entry };
            if (entry && typeof entry.url === 'string') return { url: entry.url };
            return null;
        })
        .filter(Boolean);
}

async function scrapeContacts(startUrls, maxPagesPerDomain = DEFAULT_MAX_PAGES_PER_DOMAIN) {
    const normalizedStartUrls = normalizeStartUrls(startUrls);
    if (!normalizedStartUrls.length) {
        throw new Error('Please provide at least one start URL.');
    }

    const results = new Map();
    const crawler = new CheerioCrawler({
        requestHandlerTimeoutSecs: 45,
        maxConcurrency: 5,
        async requestHandler({ request, $, enqueueLinks }) {
            const pageUrl = request.loadedUrl;
            const domain = getRootDomain(pageUrl);

            if (!results.has(domain)) {
                results.set(domain, {
                    domain,
                    emails: new Set(),
                    phones: new Set(),
                    contactPage: null,
                    aboutPage: null,
                    facebook: null,
                    instagram: null,
                    linkedin: null,
                    twitter: null,
                    youtube: null,
                    visitedCount: 0,
                    exploredFallback: false,
                });
            }

            const site = results.get(domain);
            if (site.visitedCount >= maxPagesPerDomain) return;
            site.visitedCount++;

            $('script, style, noscript').remove();

            $('a[href^="mailto:"]').each((_, el) => {
                const email = ($(el).attr('href') || '')
                    .replace(/^mailto:/i, '')
                    .split('?')[0]
                    .trim()
                    .toLowerCase();
                const cleaned = email.replace(/[),.;:]+$/g, '');
                if (isValidEmail(cleaned)) site.emails.add(cleaned);
            });

            const emailRegex = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,10}\b/gi;
            $('body').contents().each(function scan(node) {
                if (node.type === 'text') {
                    const matches = node.data.match(emailRegex);
                    if (!matches) return;
                    matches.forEach((email) => {
                        const cleaned = email.trim().toLowerCase().replace(/[),.;:]+$/g, '');
                        if (isValidEmail(cleaned)) site.emails.add(cleaned);
                    });
                } else if (node.children) {
                    node.children.forEach(scan);
                }
            });

            $('a[href^="tel:"]').each((_, el) => {
                const phone = normalizePhone(($(el).attr('href') || '').replace(/^tel:/i, ''));
                if (isValidPhone(phone)) site.phones.add(phone);
            });

            $('script[type="application/ld+json"]').each((_, el) => {
                try {
                    const raw = $(el).html();
                    if (!raw) return;
                    const json = JSON.parse(raw);
                    const candidates = [];

                    const pushFrom = (obj) => {
                        if (!obj || typeof obj !== 'object') return;
                        if (obj.telephone) candidates.push(obj.telephone);
                        if (obj.contactPoint?.telephone) candidates.push(obj.contactPoint.telephone);
                        if (Array.isArray(obj.contactPoint)) {
                            obj.contactPoint.forEach((cp) => candidates.push(cp?.telephone));
                        }
                    };

                    if (Array.isArray(json)) json.forEach(pushFrom);
                    else pushFrom(json);

                    candidates.flat().filter(Boolean).forEach((phone) => {
                        const normalized = normalizePhone(String(phone));
                        if (isValidPhone(normalized)) site.phones.add(normalized);
                    });
                } catch {
                    // Ignore invalid JSON-LD blocks.
                }
            });

            $('footer').find('*').each((_, el) => {
                const text = $(el).text();
                const matches = text.match(/(\+?\d[\d().\- ]{8,}\d)/g);
                if (!matches) return;
                matches.forEach((phone) => {
                    const normalized = normalizePhone(phone);
                    if (isValidPhone(normalized)) site.phones.add(normalized);
                });
            });

            const detectSocial = (value) => {
                const cleaned = sanitizeSocialUrl(value);
                if (!cleaned) return;
                if (/facebook\.com/i.test(cleaned)) site.facebook = site.facebook || cleaned;
                if (/instagram\.com/i.test(cleaned)) site.instagram = site.instagram || cleaned;
                if (/linkedin\.com/i.test(cleaned)) site.linkedin = site.linkedin || cleaned;
                if (/twitter\.com|x\.com/i.test(cleaned)) site.twitter = site.twitter || cleaned;
                if (/youtube\.com|youtu\.be/i.test(cleaned)) site.youtube = site.youtube || cleaned;
            };

            $('a[href]').each((_, el) => {
                const href = $(el).attr('href');
                if (!href) return;
                try {
                    detectSocial(new URL(href, pageUrl).href);
                } catch {
                    // Ignore malformed URL.
                }
            });

            const linksToEnqueue = [];
            $('a[href]').each((_, el) => {
                const href = $(el).attr('href');
                if (!href) return;
                let full;
                try {
                    full = new URL(href, pageUrl).href;
                } catch {
                    return;
                }

                if (!site.contactPage && /contact/i.test(href)) {
                    site.contactPage = full;
                    linksToEnqueue.push(full);
                }
                if (!site.aboutPage && /about/i.test(href)) {
                    site.aboutPage = full;
                    linksToEnqueue.push(full);
                }
            });

            if (!site.exploredFallback && site.emails.size === 0) {
                site.exploredFallback = true;
                $('a[href]').each((_, el) => {
                    const href = $(el).attr('href');
                    if (!href || !/privacy|legal|terms/i.test(href)) return;
                    try {
                        linksToEnqueue.push(new URL(href, pageUrl).href);
                    } catch {
                        // Ignore malformed URL.
                    }
                });
            }

            if (linksToEnqueue.length > 0) {
                await enqueueLinks({ urls: linksToEnqueue, strategy: 'same-domain' });
            }
        },
    });

    await crawler.run(normalizedStartUrls);
    return [...results.values()].map(toResultPayload);
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
    let rawBody = '';
    for await (const chunk of req) {
        rawBody += chunk;
        if (rawBody.length > 1_000_000) {
            throw new Error('Request body too large. Limit is 1 MB.');
        }
    }
    if (!rawBody.trim()) return {};
    return JSON.parse(rawBody);
}

async function startApiServer() {
    const port = Number(process.env.PORT || 3000);
    const server = createServer(async (req, res) => {
        const path = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;

        if (req.method === 'GET' && path === '/') {
            if (req.headers['x-apify-container-server-readiness-probe']) {
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Readiness probe OK\n');
                return;
            }
            sendJson(res, 200, { message: 'RapidAPI endpoint is ready', endpoint: '/scrape' });
            return;
        }

        if (req.method === 'GET' && path === '/health') {
            sendJson(res, 200, { status: 'ok' });
            return;
        }

        if (req.method === 'POST' && path === '/scrape') {
            try {
                const body = await readJsonBody(req);
                const inputUrls = body.startUrls;
                const maxPages = Number(body.maxPagesPerDomain || DEFAULT_MAX_PAGES_PER_DOMAIN);
                const data = await scrapeContacts(inputUrls, maxPages);
                sendJson(res, 200, { count: data.length, data });
            } catch (error) {
                log.warning(`Request failed: ${error.message}`);
                sendJson(res, 400, { error: error.message || 'Invalid request body' });
            }
            return;
        }

        sendJson(res, 404, { error: 'Not found' });
    });

    await new Promise((resolve) => {
        server.listen(port, () => {
            log.info(`RapidAPI local server is running on port ${port}`);
            resolve();
        });
    });
}

async function runActor() {
    const input = (await Actor.getInput()) ?? {};
    const data = await scrapeContacts(input.startUrls, input.maxPagesPerDomain || DEFAULT_MAX_PAGES_PER_DOMAIN);
    for (const item of data) {
        await Actor.pushData(item);
    }
}

await Actor.init();

Actor.on('aborting', async () => {
    // Best-effort graceful shutdown for Apify stop events.
    await setTimeout(1000);
    await Actor.exit();
});

if (process.env.API_MODE === 'true') {
    await startApiServer();
} else {
    await runActor();
    await Actor.exit();
} 
