# Activer les paiements mobile money (Orange, Moov, Telecel, Wave)

Le code de paiement est entièrement écrit et branché — [lib/cinetpay.ts](apps/web/src/lib/cinetpay.ts),
`/api/payments/initiate`, `/api/payments/webhook`. Il ne manque que vos identifiants réels
CinetPay pour que ça fonctionne en production. Tant qu'ils ne sont pas fournis,
`POST /api/payments/initiate` répond `503 PAYMENTS_NOT_CONFIGURED` proprement — rien ne casse,
les billets gratuits fonctionnent déjà sans aucune dépendance à cette pièce.

## Ce que vous devez faire (je ne peux pas le faire à votre place)

1. **Créer un compte marchand CinetPay** sur https://cinetpay.com — nécessite votre propre
   vérification d'identité/entreprise auprès d'eux (KYC), c'est une étape que seul vous
   pouvez faire.
2. Une fois le compte actif, récupérez dans le dashboard CinetPay :
   - `CINETPAY_API_KEY`
   - `CINETPAY_SITE_ID`
3. Donnez-les-moi (ou ajoutez-les vous-même) comme variables d'environnement sur Vercel
   (Production + Preview) et dans `apps/web/.env.local` pour le développement local.
4. Définissez aussi `APP_URL` sur l'URL publique réelle de l'app (ex: `https://vivre.bf` ou
   votre domaine `*.vercel.app`) — CinetPay redirige le client vers cette URL après paiement
   et y envoie son webhook.

## Couverture des réseaux — à vérifier une fois les identifiants en place

- **Orange Money, Moov Money** : confirmés au catalogue CinetPay pour le Burkina Faso.
- **Telecel Money** : présent dans le mapping du code existant (`METHOD_MAP` dans
  `lib/cinetpay.ts`), a priori supporté.
- **Wave** : Wave opère bien au Burkina Faso (confirmé via la couverture Moneroo), mais je
  n'ai pas pu confirmer avec certitude que CinetPay le propose spécifiquement pour le
  Burkina Faso dans leur canal `channels: "ALL"`. **Premier test à faire une fois les
  identifiants réels branchés** : lancez un paiement test et vérifiez si Wave apparaît sur
  la page CinetPay hébergée. Si absent, il faudra une intégration Wave séparée (API directe
  Wave Business) — dites-le-moi et je la connecterai à côté de CinetPay, le code est déjà
  structuré pour accueillir un second fournisseur (voir `payment_method` sur le modèle `Payment`).

## Test en local

CinetPay doit pouvoir atteindre votre `notify_url` (le webhook) depuis Internet — `localhost`
ne fonctionne pas pour ça. Utilisez `ngrok` (gratuit) pendant les tests locaux :

```bash
ngrok http 3100
```

Puis mettez temporairement `APP_URL` sur l'URL ngrok affichée.
