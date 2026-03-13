// Netlify Function: chat.js
// POST /.netlify/functions/chat
// Body: { messages: [{role: "user"|"assistant", content: string}] }
// Returns: { reply: string } or { error: string }

// In-memory rate limiting: Map<ip, {count, resetAt}>
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

// Cleanup old entries occasionally to prevent memory leaks
function cleanupRateLimit() {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// In-memory cache for llms.txt
let knowledgeCache = { content: '', fetchedAt: 0 };
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchKnowledge() {
  const now = Date.now();
  if (knowledgeCache.content && now - knowledgeCache.fetchedAt < CACHE_TTL_MS) {
    return knowledgeCache.content;
  }
  try {
    const res = await fetch('https://boris.io/llms.txt');
    if (res.ok) {
      knowledgeCache = { content: await res.text(), fetchedAt: now };
    }
  } catch (e) {
    console.error('Failed to fetch llms.txt:', e.message);
  }
  return knowledgeCache.content;
}

exports.handler = async function (event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Rate limiting
  const ip =
    event.headers['x-forwarded-for']?.split(',')[0].trim() ||
    event.headers['client-ip'] ||
    'unknown';

  if (Math.random() < 0.05) cleanupRateLimit(); // Cleanup ~5% of requests

  if (!checkRateLimit(ip)) {
    return {
      statusCode: 429,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Too many requests. Please wait a minute and try again.' }),
    };
  }

  // Parse body
  let messages;
  try {
    const body = JSON.parse(event.body || '{}');
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid messages');
    }
    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !msg.content || typeof msg.content !== 'string') {
        throw new Error('Invalid message format');
      }
      if (!['user', 'assistant'].includes(msg.role)) {
        throw new Error('Invalid message role');
      }
    }
    // Enforce max history
    if (messages.length > 20) {
      messages = messages.slice(-20);
    }
  } catch (err) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid request body: ' + err.message }),
    };
  }

  const knowledge = await fetchKnowledge();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not configured');
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Service not configured. Please contact hey@boris.io directly.' }),
    };
  }

  const systemPrompt = `You are an AI assistant on Boris Fründt's personal website boris.io. Answer questions about Boris helpfully and concisely, using the knowledge provided. Be friendly, direct, and slightly witty — matching Boris's personality. Never make up information not in the knowledge base. If you don't know something, say so honestly. Keep responses to 2-4 sentences unless detail is clearly needed.

Here is everything you know about Boris:

${knowledge}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: systemPrompt,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Anthropic API error:', response.status, errorBody);
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'AI service unavailable. Try again in a moment.' }),
      };
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'Sorry, I got an empty response. Try asking again.';

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error('Chat function error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Something went wrong. You can always reach Boris at hey@boris.io.' }),
    };
  }
};
