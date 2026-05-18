# Microsoft 365 → planning-tool koppeling

De centrale Outlook-agenda wordt server-side opgehaald door een Firebase Cloud
Function en gespiegeld naar Realtime Database (`/ms365_events`). De planning-pagina
leest dat node — **niemand hoeft nog in te loggen met een Microsoft-account.**

```
Outlook centrale agenda
   │  Microsoft Graph (app-only auth)
   ▼
Cloud Function  ── syncOutlook  : elke 15 min (automatisch)
                └─ refreshOutlook: /api/refresh-outlook  (de "Sync"-knop)
   │  schrijft /ms365_events
   ▼
Firebase Realtime Database
   ▼
planning.html  → "Sync"-knop toont nieuwe events om te importeren
```

De code staat klaar. Wat hieronder volgt zijn de stappen die **alleen jij** kan
doen (Azure-portaal, facturatie, deploy). Reken op ~20 minuten.

---

## 1. Azure — applicatie-rechten toevoegen

Je gebruikt de bestaande app-registratie (de tool gebruikte die al voor de
browser-login):

- **App-ID (client):** `40a7956b-44eb-46fc-a9f1-cd6aa83407d2`
- **Tenant-ID:** `d613124d-7d7b-4fe5-be9f-04e9bab00da8`

Stappen ([entra.microsoft.com](https://entra.microsoft.com) → *App-registraties* →
jouw app):

1. **API-machtigingen** → *Een machtiging toevoegen* → **Microsoft Graph** →
   **Toepassingsmachtigingen** (let op: *Toepassing*, niet *Gedelegeerd*).
2. Zoek en vink aan: **`Calendars.Read`** → *Machtigingen toevoegen*.
3. Klik **Beheerderstoestemming verlenen voor …** en bevestig.
   → De status moet groen worden ("Verleend").
   *Hiervoor heb je een Global Administrator nodig.*

> De oude gedelegeerde machtigingen (`User.Read`, `Calendars.Read`) mogen blijven
> staan of weg — ze worden niet meer gebruikt.

## 2. Azure — client secret aanmaken

1. In dezelfde app: **Certificaten en geheimen** → **Nieuw clientgeheim**.
2. Beschrijving: `firebase-planning-sync`, vervaldatum: 24 maanden.
3. **Kopieer de _waarde_ meteen** (niet de Secret-ID) — die zie je maar één keer.

> ⚠️ Het geheim verloopt. Zet een herinnering om het te vernieuwen vóór de
> vervaldatum, anders stopt de sync.

## 3. Azure — toegang beperken tot één agenda (aanbevolen)

`Calendars.Read` als toepassingsmachtiging geeft standaard toegang tot *alle*
postvakken in de tenant. Beperk de app tot enkel de centrale agenda met een
**Application Access Policy**. In PowerShell (als beheerder):

```powershell
Install-Module ExchangeOnlineManagement -Scope CurrentUser
Connect-ExchangeOnline

New-ApplicationAccessPolicy `
  -AppId 40a7956b-44eb-46fc-a9f1-cd6aa83407d2 `
  -PolicyScopeGroupId planning@senorsnacks.be `
  -AccessRight RestrictAccess `
  -Description "Planning-tool: enkel de centrale agenda"

# Controle — moet 'Granted' tonen voor de centrale mailbox:
Test-ApplicationAccessPolicy -AppId 40a7956b-44eb-46fc-a9f1-cd6aa83407d2 -Identity planning@senorsnacks.be
```

Vervang `planning@senorsnacks.be` overal door het echte adres van de centrale
agenda. Het kan tot ~30 min duren voor de policy actief is.

## 4. Centrale agenda instellen in de code

Open [functions/.env](functions/.env) en zet het echte e-mailadres van de
centrale Outlook-agenda:

```
MS_MAILBOX=planning@senorsnacks.be
```

Dit bestand staat in `.gitignore` en wordt dus niet mee gecommit.

## 5. Firebase — upgraden naar Blaze

Cloud Functions vereisen het **Blaze**-abonnement (pay-as-you-go):

1. [Firebase Console](https://console.firebase.google.com/) → project
   `operationssenorsnacks` → tandwiel → **Gebruik en facturering** → **Wijzig
   abonnement** → **Blaze** → koppel een betaalrekening.
2. Stel meteen een **budgetwaarschuwing** in (bv. €5/maand).

> **Kosten in de praktijk: ~€0.** De sync draait 96×/dag (~2.880×/maand). De
> gratis tier van Blaze dekt 2 miljoen function-calls + 3 Cloud Scheduler-jobs
> per maand. Je betaalt pas bij véél zwaarder gebruik.

## 6. Het geheim opslaan + deployen

In een terminal in de projectmap (`firebase login` indien nog niet ingelogd):

```powershell
# 1. Client secret uit stap 2 opslaan in Google Secret Manager
firebase functions:secrets:set MS_CLIENT_SECRET
#    → plak de WAARDE van het clientgeheim als je erom gevraagd wordt

# 2. Functions + hosting deployen
firebase deploy --only functions,hosting
```

De eerste deploy zet automatisch de nodige Google Cloud API's aan (Cloud Run,
Cloud Build, Artifact Registry, Cloud Scheduler, Eventarc). Dat kan een paar
minuten duren.

## 7. Testen

1. Open in de browser: `https://operationssenorsnacks.web.app/api/refresh-outlook`
   → je hoort JSON te zien zoals `{"ok":true,"count":42,...}`.
2. Open **planning.html** → klik op **Sync** → de nieuwe events verschijnen om
   te importeren.
3. Logs bekijken bij problemen:

   ```powershell
   firebase functions:log --only syncOutlook,refreshOutlook
   ```

---

## Hoe het werkt / onderhoud

| Onderdeel | Waar | Wat |
|---|---|---|
| `syncOutlook` | [functions/index.js](functions/index.js) | Scheduled, elke 15 min → schrijft `/ms365_events` |
| `refreshOutlook` | [functions/index.js](functions/index.js) | HTTP op `/api/refresh-outlook` → directe pull (Sync-knop) |
| `sync365()` | [planning.html](planning.html) | Leest de events, toont nieuwe om te importeren |
| Mailbox | [functions/.env](functions/.env) | `MS_MAILBOX` — de centrale agenda |
| Client secret | Google Secret Manager | `MS_CLIENT_SECRET` — nooit in git |

- **Alleen lezen** — de tool schrijft niets terug naar Outlook.
- **Truck-toewijzingen blijven veilig:** de sync schrijft naar een aparte node
  (`/ms365_events`); je bestaande planning (`/ft_planning_v1`) wordt nooit
  overschreven. Importeren blijft een bewuste klik.
- **Sync-interval aanpassen:** wijzig `schedule: 'every 15 minutes'` in
  [functions/index.js](functions/index.js) en deploy opnieuw.
- **Secret vervangen** (bij verloop): nieuw geheim in Azure → stap 6 opnieuw.
