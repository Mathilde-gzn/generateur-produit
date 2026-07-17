require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendWelcomeEmail(email) {
  try {
    await resend.emails.send({
      from: 'noa. <onboarding@resend.dev>',
      to: email,
      subject: 'Bienvenue sur noa. 🌿',
      html: `
        <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e8e8e6;">
          
          <!-- Header -->
          <div style="background: #0a0a0a; padding: 32px; text-align: center;">
            <div style="font-size: 32px; font-weight: 700; color: #ffffff; letter-spacing: -1px;">
              noa<span style="color: #A9F6A7;">.</span>
            </div>
          </div>

          <!-- Body -->
          <div style="padding: 40px 36px;">
            <h1 style="font-size: 22px; font-weight: 700; color: #0a0a0a; margin: 0 0 12px; letter-spacing: -0.5px;">
              Bienvenue sur noa. 👋
            </h1>
            <p style="font-size: 14px; color: #666; line-height: 1.7; margin: 0 0 24px;">
              Votre compte est créé ! Vous pouvez dès maintenant générer vos premiers contenus produit en quelques secondes.
            </p>

            <!-- Feature pills -->
            <div style="background: #f7f7f5; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
              <p style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin: 0 0 14px;">Ce que vous pouvez faire</p>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-size: 16px;">📄</span>
                  <span style="font-size: 13px; color: #1a1a18; font-weight: 500;">Fiche produit complète en 30 secondes</span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-size: 16px;">📱</span>
                  <span style="font-size: 13px; color: #1a1a18; font-weight: 500;">Posts Instagram & LinkedIn adaptés</span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-size: 16px;">🌍</span>
                  <span style="font-size: 13px; color: #1a1a18; font-weight: 500;">4 langues — FR, EN, DE, ES</span>
                </div>
              </div>
            </div>

            <!-- Free badge -->
            <div style="background: #e8fde8; border: 1px solid #b8f5b6; border-radius: 10px; padding: 14px 18px; margin-bottom: 28px; display: flex; align-items: center; gap: 10px;">
              <div style="width: 8px; height: 8px; background: #A9F6A7; border-radius: 50; flex-shrink: 0;"></div>
              <span style="font-size: 13px; font-weight: 600; color: #1a7a1a;">Vous avez 5 générations gratuites pour commencer !</span>
            </div>

            <!-- CTA -->
            <a href="https://www.getnoa.fr/login.html" style="display: block; text-align: center; background: #0a0a0a; color: #ffffff; font-size: 14px; font-weight: 700; padding: 14px; border-radius: 10px; text-decoration: none; letter-spacing: 0.02em;">
              Commencer à générer →
            </a>
          </div>

          <!-- Footer -->
          <div style="padding: 20px 36px; border-top: 1px solid #e8e8e6; text-align: center;">
            <p style="font-size: 11px; color: #ccc; margin: 0;">© 2025 noa. — Créé par Mathilde GAZEZIAN</p>
          </div>

        </div>
      `
    });
    console.log(`✅ Email de bienvenue envoyé à ${email}`);
  } catch (err) {
    console.error('Erreur email:', err);
  }
}

const FREE_LIMIT = 10;

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

// Route signup — envoie email de bienvenue
app.post('/signup', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis.' });
  await sendWelcomeEmail(email);
  res.json({ success: true });
});

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

  const prompt = `Expert copywriting e-commerce. Génère du contenu marketing pour : "${product}" (${category}).
${keywords ? `Mots clés obligatoires : ${keywords}.` : ''}
Langues : ${langList}.
Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks.

{
  "fr": {
    ${doFiche ? `"fiche": { "titre": "...(max 8 mots)", "tagline": "...(max 12 mots)", "description": "...(2 phrases)", "points_forts": ["...", "...", "..."], "cta": "...(max 6 mots)" },` : ''}
    ${doSocial ? `"social": { "instagram": "...(post court avec 3 hashtags)", "linkedin": "...(2 phrases pro)" },` : ''}
    ${doEmail ? `"email": { "objet": "...(max 8 mots)", "preheader": "...(max 10 mots)", "corps": "...(3 phrases)" }` : ''}
  }
}
Réplique la même structure pour chaque langue demandée. Sois concis.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
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
