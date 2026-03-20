const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/generate', async (req, res) => {
  const { product, category, langs, modules } = req.body;

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

    res.json(parsed);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur. Réessayez.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur lancé sur http://localhost:${PORT}`));
