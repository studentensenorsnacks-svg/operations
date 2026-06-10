# VSM.Digital — Handoff Documentation

## 📋 Project Overview

**VSM.Digital** is een portfolio website voor een jonge digitale studio uit Geel, België. De site toont expertise in:
- AI-ready websites
- Digital marketing
- Custom software development

**Live:** https://vsm-digital.web.app

---

## 🏗️ Technische Stack

- **Frontend:** HTML5, CSS3 (minified inline), Vanilla JavaScript
- **Hosting:** Firebase Hosting
- **Backend:** Firebase Realtime Database (contact form routing)
- **SEO/AI:** Schema.org structured data (LocalBusiness, Organization, FAQPage, BreadcrumbList)

---

## 📁 Bestandenstructuur

```
vsm-digital/
├── index.html          # Volledige website (single file)
└── (geen externe assets nodig - alles is inline)

Root:
├── vsm-digital.html    # Kopie voor ops hosting
├── firebase.json       # Firebase configuratie
├── .firebaserc         # Firebase project mapping
└── (andere operatie bestanden)
```

---

## 🎨 Inhoud & Secties

### 1. **Header & Navigation**
- Vaste nav met logo, links naar secties, CTA knop
- Blur effect bij scrollen
- Mobile hamburger menu

### 2. **Hero Section**
- Tagline: "Digitaal werk dat vandaag al klaar is voor morgen"
- 3-case rotator (demotab)
- CTA buttons

### 3. **Diensten (Services)**
- 3 kaarten: Websites, Marketing, Software
- Grid layout, hover effects

### 4. **Referenties (Case Studies)**
- **Senor Snacks ERP:** 15 modules, volledig ERP systeem
- **Van Hees:** Digital marketing case
- **Green Deal:** AI-ready website

### 5. **Werkwijze (Process)**
- 4-stap proces: Luisteren → Plan → Bouwen → Lanceren

### 6. **Data & Privacy**
- GDPR compliance info
- Dark section met focus op veiligheid

### 7. **Contact**
- Contactformulier (mailto-gebaseerd)
- Directe contact info
- Adres: Winkelom 87C1, 2440 Geel

---

## 🔧 Onderhoud & Updates

### Content aanpassen

**Adres wijzigen:**
```html
<b>Winkelom 87C1, 2440 Geel</b>
```

**Telefoonnummer:**
```html
+32 (0)0 00 00 00
```

**Email:**
```html
hallo@vsmdigital.be
```

**Case studies updaten:**
Zoek naar de `.case` divs en update:
- Titel
- Beschrijving
- KPI's / resultaten
- Chips/tags

### Styling aanpassen

Het CSS is inline in de `<style>` tag. Variabelen:
```css
:root {
  --blue: #1F52FF          /* Primary brand color */
  --blue-deep: #0E2FB8     /* Darker blue */
  --ink: #0A0C12           /* Dark text */
  --bg: #F6F8FC            /* Light background */
}
```

---

## 🚀 Deployment

### Firebase Deploy
```bash
firebase deploy --only hosting:vsm-digital,hosting:ops
```

### Handmatig updaten
1. Edit `vsm-digital/index.html`
2. Zorg dat beide files hetzelfde zijn:
   - `vsm-digital/index.html`
   - `vsm-digital.html` (root)
3. Commit & push
4. Deploy

---

## 📊 SEO & AI Optimization

### Structured Data (JSON-LD)
De site bevat 4 schema's:

1. **LocalBusiness** - Adres, contact, services
2. **Organization** - Company info met Service aanbod
3. **FAQPage** - 5 veelgestelde vragen
4. **BreadcrumbList** - Sitemap navigatie

### Meta Tags
- `og:title`, `og:description`, `og:url` - Social sharing
- `twitter:card` - Twitter compatibility
- `description` - Google snippet

### Performance
- Single file = minder requests
- Inline CSS = geen render blocking
- Minified HTML = klein formaat
- Mobile-first responsive

---

## 🎯 Button & CTA Styling

**Header "Start een project" button:**
```css
.nav-cta {
  background: var(--blue);      /* Blauw */
  color: #fff;                  /* Wit text */
}
```

**CTA Band "Plan een kennismaking" button (blauwe section):**
```css
.cta-band .btn {
  background: #fff;             /* Wit */
  color: #0A0C12;               /* Donker text */
}
```

---

## 📱 Responsiveness

- Desktop: Grid layouts, full-width sections
- Tablet (max-width: 1020px): 2-column grids
- Mobile (max-width: 700px): Single column, hamburger menu

Media queries in CSS handelen dit af.

---

## 🔐 Security & Compliance

- ✅ GDPR compliant (no tracking scripts)
- ✅ No external dependencies (except Google Fonts)
- ✅ HTTPS via Firebase
- ✅ Content Security Policy ready

---

## 📞 Contact Form

Het formulier is **mailto-based**:
```javascript
location.href = `mailto:hallo@vsmdigital.be?subject=${subject}&body=${body}`;
```

Dit opent de email client van de gebruiker. Geen backend nodig.

---

## 🐛 Troubleshooting

**Button is niet zichtbaar:**
- Check `.nav-cta` en `.cta-band .btn` CSS colors
- Zorg dat contrast ≥ 4.5:1

**Content laadt niet:**
- Verifieer HTML entities zijn correct (`&middot;`, `&rarr;`, etc.)
- Check console voor JS errors

**Deploy mislukt:**
- Zorg dat beide `vsm-digital.html` en `vsm-digital/index.html` identiek zijn
- Check Firebase project is correct in `.firebaserc`

---

## 📈 Analytics & Tracking

Momenteel geen analytics geïnstalleerd. Om toe te voegen:
1. Google Analytics 4 script in `<head>`
2. GTM tags voor CTA tracking

---

## 🎓 Training & Next Steps

1. **Inhoud updaten:** Use this guide for tweaking copy/case studies
2. **Styling:** Edit CSS in `<style>` tag
3. **Deploy:** Use Firebase CLI commands
4. **Monitoring:** Check Firebase console for hosting logs

---

## 📞 Contact for Support

- **Repository:** GitHub (studentensenorsnacks-svg/operations)
- **Hosting:** Firebase (operationssenorsnacks project)
- **DNS:** vsm-digital.web.app

---

**Laatste update:** June 10, 2026  
**Version:** 1.0 (Extended with 15 Senor Snacks ERP modules)
