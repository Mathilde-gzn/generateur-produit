const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const FREE_LIMIT = 5;

const app = express();
app.use(cors());

// ⚠️ Webhook Stripe doit être AVANT express.json()
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed' || event.type === 'invoice.paid') {
    const session = event.data.object;
    const customerEmail = session.customer_email || session.customer_details?.email;

    if (customerEmail) {
      const { error } = await supabase
        .from('profiles')
        .update({ plan: 'pro' })
        .eq('email', customerEmail);

      if (error) {
        console.error('Supabase update error:', error);
      } else {
        console.log(`✅ Plan Pro activé pour ${customerEmail}`);
      }
    }
  }

  res.json({ received: true });
});

app.use(express.json());

// Route landing page en premier
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Vérifie le token utilisateur envoyé depuis le frontend
async function checkUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Non connecté.' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Session invalide. Reconnectez-vous.' });
  }

  req.user = user;
  next();
}

app.get('/me', checkUser, async (req, res) => {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('email, generations_count, plan')
    .eq('id', req.user.id)
    .single();

  if (error) return res.status(500).json({ error: 'Erreur de profil.' });
  res.json({
    ...profile,
    remaining: profile.plan === 'free' ? Math.max(0, FREE_LIMIT - profile.generations_count) : 'illimité'
  });
});

app.post('/generate', checkUser, async (req, res) => {
  const { product, category, langs, modules, keywords } = req.body;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('generations_count, plan')
    .eq('id', req.user.id)
    .single();

  if (profileError) {
    return res.status(500).json({ error: 'Erreur de profil.' });
  }

  if (profile.plan === 'free' && profile.generations_count >= FREE_LIMIT) {
    return res.status(403).json({
      error: `Limite gratuite atteinte (${FREE_LIMIT} générations). Passez au plan payant pour continuer.`
    });
  }

  if (!product || !langs || langs.length === 0) {
    return res.status(400).json({ error: 'Produit et langues requis.' });
  }

  const langNames = {
    fr: 'Français', en: 'English', de: 'Deutsch', es: 'Español'
  };
  const langList = langs.map(l => langNames[l]).join(', ');
  const doFiche  = modules.includes('fiche');
  const doSocial = modules.includes('social');
  const doEmail  = modules.includes('email');

  const prompt = `Tu es un expert en copywriting e-commerce et marketing digital.
Produit : "${product}" — Catégorie : ${category}
Langues : ${langList}
${keywords ? `Mots clés et éléments IMPORTANTS à faire ressortir obligatoirement dans tout le contenu : ${keywords}` : ''}

Génère le contenu suivant pour chaque langue.
Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks.

Structure JSON :
{
  "fr": {
    ${doFiche ? `"fiche": {
      "titre": "...",
      "tagline": "...",
      "description": "...",
      "points_forts": ["...", "...", "...", "..."],
      "cta": "..."
    },` : ''}
    ${doSocial ? `"social": {
      "instagram": "...(post Instagram avec emojis et hashtags)",
      "linkedin": "...(post LinkedIn professionnel)"
    },` : ''}
    ${doEmail ? `"email": {
      "objet": "...",
      "preheader": "...",
      "corps": "..."
    }` : ''}
  }
}

N'inclus que les langues demandées. Adapte le ton à la catégorie.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const raw   = data.content.map(i => i.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    await supabase
      .from('profiles')
      .update({ generations_count: profile.generations_count + 1 })
      .eq('id', req.user.id);

    res.json(parsed);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur. Réessayez.' });
  }
});

// Fichiers statiques après les routes
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur lancé sur http://localhost:${PORT}`));
