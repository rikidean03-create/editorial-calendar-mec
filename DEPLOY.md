# Deploy sempre attivo (PC spento)

Questa app può essere ospitata su un servizio cloud in modo che rimanga attiva anche quando il tuo PC è spento. Di seguito trovi due percorsi semplici.

## Opzione A — Render (consigliato)

Prerequisiti:
- Repository Git con il contenuto della cartella `calendario editoriale`.

Passi:
1. Importa il repository su GitHub (o GitLab/Bitbucket).
2. Vai su Render e crea un nuovo "Web Service" → "Deploy an existing image or Dockerfile".
3. Seleziona il tuo repo; Render rileverà il `Dockerfile`.
4. Aggiungi un disco persistente:
   - Tab "Disks" → Add Disk → nome `data`, mount path `/app/data`, dimensione 1–5 GB.
   - Questo mantiene `data/posts.json` permanente.
5. Imposta le variabili d'ambiente:
   - `PUBLIC_BASE_URL`: `https://<IL_TUO_SITO>.onrender.com`
   - `PORT`: non serve impostarla manualmente; Render la passa automaticamente e il server la legge.
6. Deploy. Quando il servizio è attivo, apri l’URL pubblico.

Note OAuth (Dropbox/Google Drive):
- Aggiorna i redirect URIs nei rispettivi pannelli developer con:
  - `https://<IL_TUO_SITO>.onrender.com/dropbox/callback`
  - `https://<IL_TUO_SITO>.onrender.com/google/callback`

Infra-as-code:
- È incluso `render.yaml` per automatizzare configurazione servizio, disco e variabili.

## Opzione B — Railway

Prerequisiti:
- Repo su GitHub.

Passi:
1. Crea un nuovo progetto su Railway → Web service dal tuo repo.
2. Usa il `Dockerfile` incluso.
3. Aggiungi un "Volume" e montalo su `/app/data`.
4. Imposta `PUBLIC_BASE_URL` con la tua URL Railway.
5. Deploy.

## Opzione C — VPS/Fly.io

- Puoi usare Fly.io con volumi persistenti: monta un volume su `/app/data` e deploy con Docker.

## Checklist post-deploy

- [ ] Verifica che l’URL pubblico risponda (`/`).
- [ ] Crea/modifica un evento e controlla che persista dopo il riavvio.
- [ ] Aggiorna OAuth redirect URIs e prova il login/sync.

Se vuoi, posso occuparmi di creare il repo e collegarlo a Render, impostando le variabili e il disco.