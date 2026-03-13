// Netlify Function: chat.js
// POST /.netlify/functions/chat
// Body: { messages: [{role: "user"|"assistant", content: string}] }
// Returns: { reply: string } or { error: string }

const KNOWLEDGE_BASE = `
# Boris Fründt — Knowledge Base

## Who is Boris?

Boris Fründt is a CTO and Technical Product Executive with nearly 20 years of experience building digital products and the engineering teams that ship them. He's based in Potsdam, Germany (near Berlin). His superpower: speaking both languages — business and engineering — fluently.

He's the kind of person who can walk out of a design review about user needs and immediately walk into a backend architecture discussion about data models. "Turning 'that won't work' into 'oh wait, it does'" is how he describes what he does.

## Career Timeline

### IBM — Web Developer (2007–2009)
Started at IBM as a Web Developer. Part of a dual-study program (B.Sc. Business Information Systems at the Berlin School of Economics and Law + IBM Germany). Learned how technology works at scale — global teams, complex architectures, large-organization patience.

### Jung von Matt — Senior Web Developer & Team Lead (2009–2014)
Moved to Jung von Matt, one of Europe's leading creative agencies. Grew from developer to team lead over 5 years. Built digital products for major brands. Learned the value of "remaining constructively dissatisfied."

### IBM iX — Web Application Architect & Consultant (2015–2016)
Returned to IBM in a senior consulting role as Web Application Architect. Worked with IBM Watson as early as 2015 — his entry into AI/ML work.

### Jung von Matt — Technical Director (2017–2018)
Came back to JvM as Technical Director. In 18 months, grew the tech team from zero to 14 people. Built digital products for major brands. First major leadership experience at that scale.

### Freelance — Technical Product Manager & Developer (2019–present)
Went independent. 5+ years of taking full ownership — from pitch to production. Learned that the best client relationships are built on honesty, not slide decks. Worked across industries with multiple clients.

Notable freelance engagement:
- digetiers — Interim Senior Manager (2022): AI-based vehicle pricing platform.

### SWAN — CTO (2025)
Most recent role: CTO of SWAN, a connected products startup building smart mirror and mobile apps. Led 23 engineers through product strategy, hardware-software integration, and eventually company acquisition by a US company. Left the role after the acquisition completed.

## Education

B.Sc. Business Information Systems — Berlin School of Economics and Law + IBM Germany
Dual study program, 2004–2007.

## Core Skills & Expertise

### Engineering Leadership
- Scaling and leading engineering teams (up to 23 people)
- Building team culture: mentoring, direct communication, constructive dissatisfaction
- Hiring, structuring, and growing tech teams from scratch
- Agile methodologies, Design Thinking, user-centered product development

### Technical Product
- Technical product strategy — bridging business goals and technical architecture
- Product vision definition and execution
- Roadmap management and stakeholder alignment
- Translating complex technical concepts for non-technical stakeholders

### Development & Architecture
- Frontend: React, Next.js, TypeScript, JavaScript
- Backend: Node.js, TypeScript
- Infrastructure: Cloud architectures, Netlify, deployment pipelines
- IoT & Connected Systems: Hardware-software integration, device-to-cloud
- AI/ML: Working with AI since IBM Watson (2015), AI strategy and integration, LLMs

### Working Style & Values
- Product vision first — then figure out how to build it
- Direct communication — honest disagreement beats polite misunderstanding
- Leadership = removing obstacles, not creating bureaucracy
- Purpose over prestige — driven by meaningful work, not titles
- Humor, empathy, and transparency are core leadership skills
- Constructively dissatisfied: always looking for the better way

## Currently Open For

Boris is actively looking for new opportunities starting April/May 2026.

Target Roles:
- Senior Engineering Manager (managing managers or large teams)
- Technical Director / VP Engineering
- Senior Product Manager / Director of Product (technical PM focus)
- Open to CTO if it's the right company

Preferences:
- Location: Berlin / remote (or hybrid Berlin-based)
- Company type: Purpose-driven companies; sustainability, health, social impact, meaningful tech
- Company stage: Series A–C scale-up, larger company with startup energy, or mission-driven enterprise
- Not interested in: pure management-consultant roles, FAANG, companies without clear product vision

## Contact & Links

- Email: hey@boris.io
- Website: https://boris.io
- LinkedIn: https://www.linkedin.com/in/borisfruendt
- GitHub: https://github.com/b0ndt

Boris prefers email for initial contact. LinkedIn is fine too.

## Additional Context

- Native German speaker, works fluently in English
- Based in Potsdam (15 min from Berlin by train), happy to commute or work remote
- Industries: creative/advertising (JvM), enterprise tech (IBM), AI/ML, connected hardware/IoT (SWAN), automotive, retail, media (freelance)
- Has managed full hardware+software stacks including device-to-cloud systems
- Started working with AI in 2015 at IBM Watson — before it was cool
- Leadership style: direct, empathetic, humor-infused; removes obstacles; gives teams autonomy with clear goals
`;

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

${KNOWLEDGE_BASE}`;

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
