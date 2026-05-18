/**
 * Génère public/privacy-policy.html depuis PRIVACY_POLICY (constants/legal.ts).
 *
 * Le HTML produit est :
 *  - autonome (aucune dépendance externe, CSS inline)
 *  - responsive
 *  - accessible (sémantique HTML5, ARIA, contrastes)
 *  - SEO-friendly (meta, OpenGraph, structured data)
 *  - prêt à être uploadé sur eatquicker.fr (OVH static hosting)
 *
 * USAGE :
 *   npx tsx scripts/generate-privacy-policy.ts
 *
 * L'URL publique sera :
 *   https://eatquicker.fr/privacy-policy.html
 * à fournir dans Play Console → App content → Privacy Policy.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PRIVACY_POLICY } from '../constants/legal';

// ─── Types alignés sur la structure de PRIVACY_POLICY ────────────────────────
interface Subsection {
  title: string;
  content: string;
  bulletPoints?: string[];
}

interface Section {
  title: string;
  content?: string;
  subsections?: Subsection[];
  bulletPoints?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const slugify = (str: string): string =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const renderBulletPoints = (points: string[]): string => {
  const items = points
    .map((p) => `      <li>${escapeHtml(p)}</li>`)
    .join('\n');
  return `    <ul>\n${items}\n    </ul>`;
};

const renderSubsection = (sub: Subsection): string => {
  const parts: string[] = [];
  parts.push(`  <h3>${escapeHtml(sub.title)}</h3>`);
  if (sub.content) {
    parts.push(`  <p>${escapeHtml(sub.content)}</p>`);
  }
  if (sub.bulletPoints && sub.bulletPoints.length > 0) {
    parts.push(renderBulletPoints(sub.bulletPoints));
  }
  return parts.join('\n');
};

const renderSection = (section: Section, index: number): string => {
  const id = `section-${index}-${slugify(section.title)}`;
  const parts: string[] = [];
  parts.push(`<section id="${id}" aria-labelledby="${id}-title">`);
  parts.push(`  <h2 id="${id}-title">${escapeHtml(section.title)}</h2>`);
  if (section.content) {
    parts.push(`  <p>${escapeHtml(section.content)}</p>`);
  }
  if (section.bulletPoints && section.bulletPoints.length > 0) {
    parts.push(renderBulletPoints(section.bulletPoints));
  }
  if (section.subsections) {
    for (const sub of section.subsections) {
      parts.push(renderSubsection(sub));
    }
  }
  parts.push('</section>');
  return parts.join('\n');
};

const renderTableOfContents = (sections: Section[]): string => {
  const items = sections
    .map((s, i) => {
      const id = `section-${i}-${slugify(s.title)}`;
      return `      <li><a href="#${id}">${escapeHtml(s.title)}</a></li>`;
    })
    .join('\n');
  return `    <nav class="toc" aria-label="Sommaire">
      <h2>Sommaire</h2>
      <ol>
${items}
      </ol>
    </nav>`;
};

// ─── Template HTML ───────────────────────────────────────────────────────────
const buildHtml = (): string => {
  const title = escapeHtml(PRIVACY_POLICY.title);
  const lastUpdate = escapeHtml(PRIVACY_POLICY.lastUpdate);
  const sectionsHtml = PRIVACY_POLICY.sections
    .map((s, i) => renderSection(s as Section, i))
    .join('\n\n');
  const toc = renderTableOfContents(PRIVACY_POLICY.sections as Section[]);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Politique de Confidentialité de l'application EatQuickeR. Conforme RGPD. Dernière mise à jour : ${lastUpdate}.">
  <meta name="robots" content="index, follow">
  <meta name="author" content="BETTONI ALEX">

  <!-- OpenGraph -->
  <meta property="og:title" content="${title} — EatQuickeR">
  <meta property="og:description" content="Politique de Confidentialité conforme RGPD pour l'application EatQuickeR.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://eatquicker.fr/privacy-policy.html">
  <meta property="og:locale" content="fr_FR">

  <title>${title} — EatQuickeR</title>

  <link rel="icon" type="image/png" href="/favicon.png">

  <style>
    :root {
      --navy-dark: #0D1629;
      --navy: #1E2A78;
      --navy-light: #111B39;
      --gold: #D4AF37;
      --text-primary: #1A1F36;
      --text-secondary: #4B5563;
      --text-muted: #6B7280;
      --bg: #FAFBFC;
      --surface: #FFFFFF;
      --border: #E5E7EB;
      --border-light: #F3F4F6;
      --shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 4px 12px rgba(0, 0, 0, 0.04);
    }

    * { box-sizing: border-box; }

    html { scroll-behavior: smooth; }

    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      font-size: 16px;
      line-height: 1.7;
      color: var(--text-primary);
      background: var(--bg);
      -webkit-font-smoothing: antialiased;
    }

    .topbar {
      background: linear-gradient(135deg, var(--navy-dark) 0%, var(--navy) 100%);
      color: #FFFFFF;
      padding: 32px 24px;
      text-align: center;
    }

    .brand {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #FFFFFF;
      text-decoration: none;
      display: inline-block;
    }

    .brand .accent { color: var(--gold); }

    .topbar p {
      margin: 8px 0 0;
      opacity: 0.85;
      font-size: 0.95rem;
    }

    main {
      max-width: 880px;
      margin: -24px auto 64px;
      padding: 48px 32px;
      background: var(--surface);
      border-radius: 16px;
      box-shadow: var(--shadow);
      position: relative;
    }

    h1 {
      font-size: 2.25rem;
      font-weight: 700;
      margin: 0 0 8px;
      letter-spacing: -0.02em;
      color: var(--navy-dark);
    }

    .last-update {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin: 0 0 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
    }

    .toc {
      background: var(--border-light);
      border-radius: 12px;
      padding: 20px 28px;
      margin: 0 0 40px;
    }

    .toc h2 {
      font-size: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary);
      margin: 0 0 12px;
      padding: 0;
      border: none;
    }

    .toc ol {
      margin: 0;
      padding-left: 24px;
      columns: 2;
      column-gap: 24px;
    }

    .toc li {
      margin-bottom: 6px;
      break-inside: avoid;
    }

    .toc a {
      color: var(--navy);
      text-decoration: none;
      font-size: 0.92rem;
    }

    .toc a:hover { text-decoration: underline; }

    section {
      margin-top: 40px;
      padding-top: 24px;
      border-top: 1px solid var(--border-light);
    }

    section:first-of-type {
      border-top: none;
      padding-top: 0;
    }

    h2 {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--navy);
      margin: 0 0 16px;
      letter-spacing: -0.01em;
      scroll-margin-top: 24px;
    }

    h3 {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--navy-dark);
      margin: 24px 0 12px;
    }

    p {
      margin: 0 0 16px;
      color: var(--text-secondary);
    }

    ul {
      margin: 0 0 16px;
      padding-left: 24px;
    }

    li {
      margin-bottom: 8px;
      color: var(--text-secondary);
    }

    li::marker { color: var(--gold); }

    a { color: var(--navy); }

    footer {
      max-width: 880px;
      margin: 0 auto;
      padding: 24px 32px 48px;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    footer a {
      color: var(--text-muted);
      margin: 0 8px;
    }

    .back-to-top {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--navy);
      color: #FFFFFF;
      border: none;
      border-radius: 50%;
      width: 48px;
      height: 48px;
      font-size: 1.2rem;
      cursor: pointer;
      box-shadow: var(--shadow);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
    }

    .back-to-top.visible {
      opacity: 1;
      pointer-events: auto;
    }

    @media (max-width: 640px) {
      .topbar { padding: 24px 16px; }
      main {
        margin: -16px 16px 32px;
        padding: 32px 20px;
        border-radius: 12px;
      }
      h1 { font-size: 1.75rem; }
      h2 { font-size: 1.25rem; }
      .toc ol { columns: 1; }
      .back-to-top { bottom: 16px; right: 16px; }
    }

    @media print {
      .topbar, .back-to-top, .toc { display: none; }
      main {
        margin: 0;
        padding: 0;
        box-shadow: none;
        max-width: 100%;
      }
      body { background: #FFFFFF; }
    }
  </style>
</head>
<body>

  <header class="topbar">
    <a href="/" class="brand">Eat<span class="accent">Quicke</span>R</a>
    <p>Commandez. Partagez. Payez en quelques secondes.</p>
  </header>

  <main>
    <h1>${title}</h1>
    <p class="last-update">Dernière mise à jour : <strong>${lastUpdate}</strong></p>

${toc}

${sectionsHtml}

  </main>

  <footer>
    <p>© 2025 BETTONI ALEX — EatQuickeR. Tous droits réservés.</p>
    <p>
      <a href="/">Accueil</a> ·
      <a href="/terms.html">CGU</a> ·
      <a href="mailto:contact@eatquicker.com">Contact</a>
    </p>
  </footer>

  <button class="back-to-top" id="backToTop" aria-label="Retour en haut">↑</button>

  <script>
    (function () {
      var btn = document.getElementById('backToTop');
      window.addEventListener('scroll', function () {
        if (window.scrollY > 400) btn.classList.add('visible');
        else btn.classList.remove('visible');
      });
      btn.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    })();
  </script>

</body>
</html>
`;
};

// ─── Exécution ───────────────────────────────────────────────────────────────
const main = () => {
  const html = buildHtml();
  const outputDir = path.resolve(__dirname, '../public');
  const outputPath = path.join(outputDir, 'privacy-policy.html');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, html, 'utf-8');

  const sizeKb = (Buffer.byteLength(html, 'utf-8') / 1024).toFixed(1);
  console.log(`✅ Politique générée : ${outputPath}`);
  console.log(`   Taille : ${sizeKb} Ko`);
  console.log(`   Sections : ${PRIVACY_POLICY.sections.length}`);
  console.log(`   Version : ${PRIVACY_POLICY.lastUpdate}`);
  console.log('');
  console.log('📤 Étape suivante :');
  console.log('   Upload via FileZilla sur eatquicker.fr/privacy-policy.html');
  console.log('   URL publique : https://eatquicker.fr/privacy-policy.html');
};

main();
