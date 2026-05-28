# EventPay beheer

Webapplicatie om de EventPay API te bedienen: wallets, transacties, verkoop, operatoren, apparaten, voorraad, producten en reusables.

Gebouwd met **Next.js 15 + TypeScript**. De app draait los van de andere Señor Snacks operations-pagina's en heeft zijn eigen `package.json`.

---

## Wat zit erin?

| Module | URL | Functies |
| --- | --- | --- |
| Dashboard | `/` | Verbindingsstatus, ping naar EventPay, rate-limit gebruik |
| Wallets | `/wallets` | Zoeken via QR/NFC/code, saldo, historiek, eigenschappen aanpassen |
| Transacties | `/transacties` | Lijst met filters, aanmaken (opladen/cash), ongedaan maken |
| Verkoop | `/verkoop` | Verkoopsdata gegroepeerd op sector/apparaat/operator/BTW/categorieën |
| Operatoren | `/operatoren` | Operatoren en groepen, externe IDs synchroniseren |
| Apparaten | `/apparaten` | Pinned instellingen, berichten sturen |
| Voorraad | `/voorraad` | Stock per sector, historiek |
| Producten | `/producten` | Producten aanpassen, sectorboom met categorieën |
| Reusables | `/reusables` | Identified products + refunds |

---

## Eerste installatie (eenmalig)

Open PowerShell en navigeer naar deze folder:

```powershell
cd c:\Users\Eigenaar\operations\eventpay
```

Installeer alle dependencies:

```powershell
npm install
```

Dit downloadt Next.js, React en TypeScript naar `node_modules/` (komt niet in git, staat in `.gitignore`).

### API-key configureren

Het bestand `.env.local` bevat je EventPay token. Het staat **niet** in git. Open het en zet je echte waarden erin:

```
EVENTPAY_BASE_URL=https://senor-snacks.eventpay.be
EVENTPAY_API_KEY=jouw-bearer-token-hier
```

> **Belangrijk:** behandel de API-key als een wachtwoord. Niet in chat plakken, screenshots, e-mail of git. Als hij ooit lekt: vraag bij EventPay een nieuwe key en zet de oude op verlopen.

---

## App starten (dev-modus)

```powershell
npm run dev
```

Open daarna in je browser:

```
http://localhost:3100
```

De app draait op poort **3100** zodat ze niet botst met andere lokale tools.

Je ziet meteen het dashboard. De "Verbindingsstatus"-kaart toont:
- of de base URL en API-key correct zijn ingesteld
- het resultaat van een live `GET /ping` naar EventPay (zou groen "OK 200" moeten zijn)
- het huidige rate-limit gebruik (X / 40 in de laatste 10 seconden)

---

## Hoe het systeem werkt

```
┌─────────────┐    /api/eventpay/*    ┌─────────────────┐    /api/v1/*
│  Browser    │ ────────────────────▶ │ Next.js backend │ ───────────────▶ EventPay
│ (jouw scherm)│ ◀──────────────────── │  (deze app)     │ ◀───────────────
└─────────────┘     JSON              └─────────────────┘    Bearer-token
                                              ▲
                                              │ leest
                                              │
                                       .env.local (token)
```

- De **browser** kent je EventPay API-key **nooit**. Hij praat alleen met `/api/eventpay/*` op je eigen Next.js server.
- De **Next.js backend** voegt het bearer token toe en stuurt door naar `https://senor-snacks.eventpay.be/api/v1/*`.
- Een centrale **rate limiter** zorgt dat je nooit meer dan 40 verzoeken per 10 seconden naar EventPay stuurt — extra verzoeken wachten automatisch.

---

## Productie-veiligheid

Er is **geen testomgeving** bij EventPay. Alles wat je doet, gebeurt direct in productie. De app heeft daarom:

- **Bevestigingsdialogen** bij elke schrijfactie (transactie aanmaken, undo, wallet-attribuut aanpassen, product bewerken, refund).
- **Idempotency-keys** (UUIDv4) bij transacties en refunds — als je per ongeluk dubbelklikt wordt de tweede aanvraag genegeerd door EventPay.
- **Rate limiting** server-side, zodat je nooit per ongeluk de 429-grens raakt.
- **Errors zichtbaar** boven elke pagina, inclusief HTTP-status en validatiefouten van EventPay.

---

## Veelgestelde vragen

**Kan ik dit op mijn telefoon gebruiken?**
Ja, zolang `npm run dev` draait op je computer kan je op je telefoon naar `http://<jouw-pc-ip>:3100` surfen (in hetzelfde wifi-netwerk). Voor publiek gebruik moet je hem deployen — vraag mij dan voor begeleiding.

**Hoe stop ik de server?**
`Ctrl+C` in het PowerShell-venster waar `npm run dev` draait.

**Hoe update ik?**
Dependencies bijwerken: `npm update`. Voor major versie-bumps van Next.js: vraag eerst om hulp.

**Mag ik dit pushen naar git?**
Ja. `.env.local` staat in `.gitignore` en wordt automatisch overgeslagen — zo lekt je token nooit. Controleer voor je pusht altijd met `git status` dat `.env.local` **niet** in de lijst van te committen bestanden staat.

---

## Bestandsstructuur

```
eventpay/
├── .env.example           — voorbeeld config (mag in git)
├── .env.local             — jouw echte token (NIET in git)
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.js
├── README.md              — dit bestand
└── src/
    ├── app/
    │   ├── layout.tsx     — globale layout met sidebar
    │   ├── page.tsx       — dashboard
    │   ├── globals.css    — styling (Señor Snacks rood)
    │   ├── api/
    │   │   ├── status/route.ts           — ping + rate-limit status
    │   │   └── eventpay/[...path]/route.ts — proxy naar EventPay
    │   ├── wallets/page.tsx
    │   ├── transacties/page.tsx
    │   ├── verkoop/page.tsx
    │   ├── operatoren/page.tsx
    │   ├── apparaten/page.tsx
    │   ├── voorraad/page.tsx
    │   ├── producten/page.tsx
    │   └── reusables/page.tsx
    ├── components/
    │   ├── Nav.tsx          — sidebar
    │   ├── ConfirmDialog.tsx
    │   └── Alert.tsx
    └── lib/
        ├── eventpay.ts      — server-side fetch wrapper
        ├── rate-limiter.ts  — 40/10s sliding window
        ├── client.ts        — browser-side API helper
        └── types.ts         — TypeScript types
```

---

## Wat als een endpoint anders blijkt te werken dan ik dacht?

De EventPay docs zijn de bron van waarheid, maar de exacte JSON-structuur (veldnamen, optionele velden) kan tussen events licht verschillen. De app heeft daarom overal een **"Volledige JSON-respons tonen"** sectie waar je de ruwe data ziet. Als een veld niet correct getoond wordt — open een issue of stuur me een screenshot van de JSON.
