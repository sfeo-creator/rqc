# Guide complet : Migrer rQC de IndexedDB vers Supabase

---

## Table des matières

1. Comprendre le problème
2. Comprendre la solution : Supabase
3. Créer ton projet Supabase (étape par étape)
4. Créer la table "data"
5. Configurer la sécurité (RLS)
6. Récupérer tes clés
7. Modifier le code (ce qui change et pourquoi)
8. Importer tes données existantes
9. Déployer sur GitHub Pages
10. Résumé des différences IndexedDB vs Supabase

---

## 1. Comprendre le problème

Ton application rQC utilise **IndexedDB**, une base de données intégrée au navigateur. Le problème :

- **Les données sont locales** : chaque utilisateur a sa propre copie. Si Pierre ajoute une entrée sur son téléphone, Marie ne la voit pas sur le sien.
- **Les données sont liées au navigateur** : si tu changes de navigateur ou vides le cache, tout disparaît.
- **Le système d'import/export JSON via OneDrive** est fastidieux : il faut manuellement exporter, uploader, télécharger, importer…

**Ce qu'on veut** : une base de données unique, en ligne, partagée par tous les utilisateurs, accessible depuis n'importe quel appareil.

---

## 2. Comprendre la solution : Supabase

### C'est quoi Supabase ?

Supabase est un service gratuit qui te donne :

- **Une base de données PostgreSQL** hébergée dans le cloud (les serveurs de Supabase)
- **Une API REST automatique** : tu peux lire/écrire dans ta base directement depuis JavaScript, sans créer de serveur
- **Un dashboard web** : une interface visuelle pour voir et gérer tes données (comme un Excel en ligne)

### Comment ça communique ?

```
┌─────────────┐      HTTPS (internet)      ┌──────────────────┐
│  Ton site   │  ◄─────────────────────►   │    Supabase      │
│  (GitHub    │    requêtes fetch()         │  ┌────────────┐  │
│   Pages)    │    avec ta clé anon         │  │ PostgreSQL │  │
│             │                             │  │  (ta base) │  │
└─────────────┘                             │  └────────────┘  │
                                            └──────────────────┘
```

1. Ton site HTML s'ouvre dans le navigateur de l'utilisateur
2. Le code JavaScript appelle Supabase via internet (HTTPS)
3. Supabase exécute la requête sur la base de données
4. Supabase renvoie le résultat au navigateur
5. Ton code affiche les données

**Tout passe par internet**, donc n'importe qui avec ton site peut lire/écrire dans la même base.

### La clé "anon", c'est quoi ?

C'est un identifiant public qui dit à Supabase "cette requête vient de ton projet rQC". Elle est visible dans le code source (c'est normal et prévu). La sécurité ne repose pas sur cette clé mais sur les **Row Level Security policies** (RLS) qu'on configure côté Supabase.

---

## 3. Créer ton projet Supabase (étape par étape)

1. Va sur **https://supabase.com** et clique "Start your project"
2. Connecte-toi avec ton compte **GitHub** (pratique puisque tu l'utilises déjà)
3. Clique **"New Project"**
4. Remplis :
   - **Name** : `rqc`
   - **Database Password** : choisis un mot de passe fort (note-le quelque part, on en aura besoin si tu veux accéder à la base en SQL direct)
   - **Region** : choisis `West EU (Ireland)` (le plus proche de la France)
5. Clique **"Create new project"**
6. Attends 1-2 minutes que le projet se crée

---

## 4. Créer la table "data"

Une fois le projet créé, va dans **Table Editor** (menu de gauche) puis clique **"New Table"**.

### Nom de la table
```
data
```

### Colonnes à créer

| Nom de colonne | Type       | Valeur par défaut        | Nullable ? |
|----------------|------------|--------------------------|------------|
| `id`           | `int8`     | (auto-généré, c'est la Primary Key — déjà créée par défaut) | Non |
| `created_at`   | `timestamptz` | `now()`               | Non        |
| `prix`         | `float8`   | —                        | Non        |
| `volume`       | `float8`   | —                        | Non        |
| `degre`        | `float8`   | —                        | Non        |
| `magasin`      | `text`     | —                        | Non        |
| `type_alcool`  | `text`     | —                        | Non        |
| `references`   | `text`     | —                        | Non        |
| `ville`        | `text`     | —                        | Non        |
| `volume_alcool`| `float8`   | —                        | Non        |
| `masse_alcool` | `float8`   | —                        | Non        |
| `rqc`          | `float8`   | —                        | Non        |
| `prix_litre`   | `float8`   | —                        | Non        |

### Méthode alternative : SQL direct

Si tu préfères, va dans **SQL Editor** (menu de gauche) et colle ce code :

```sql
CREATE TABLE data (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
    prix        FLOAT8 NOT NULL,
    volume      FLOAT8 NOT NULL,
    degre       FLOAT8 NOT NULL,
    magasin     TEXT NOT NULL,
    type_alcool TEXT NOT NULL,
    reference  TEXT NOT NULL,
    ville       TEXT NOT NULL,
    volume_alcool FLOAT8 NOT NULL,
    masse_alcool  FLOAT8 NOT NULL,
    rqc         FLOAT8 NOT NULL,
    prix_litre  FLOAT8 NOT NULL,

    -- Contrainte anti-doublon :
    -- Empêche d'avoir 2 lignes identiques sur ces 6 colonnes
    UNIQUE (reference, magasin, ville, prix, volume, degre)
);
```

> **Anti-doublons** : la contrainte `UNIQUE` ci-dessus empêche la base d'accepter deux entrées avec la même combinaison de référence + magasin + ville + prix + volume + degré. Si le prix change pour un même produit dans un même magasin, c'est une nouvelle entrée valide. Le code JavaScript vérifie aussi les doublons AVANT d'envoyer la requête, pour afficher un message clair à l'utilisateur plutôt qu'une erreur technique.

Puis clique **"Run"**.

> **Note** : la colonne `id` remplace l'`autoIncrement` d'IndexedDB. Supabase génère automatiquement un identifiant unique pour chaque ligne.

> **Note** : la colonne `created_at` est un bonus — elle enregistre automatiquement la date/heure d'ajout de chaque entrée. Pratique pour savoir quand une donnée a été ajoutée.

---

## 5. Configurer la sécurité (RLS)

### C'est quoi le RLS ?

**Row Level Security** = des règles qui disent "qui a le droit de faire quoi" sur chaque ligne de ta table. Sans ça, personne ne peut lire ou écrire (même avec la clé anon).

### Configuration pour ton cas

Tu veux que **tout le monde** puisse lire et écrire (c'est un site collaboratif entre potes). Va dans **SQL Editor** et exécute :

```sql
-- Active le RLS sur la table
ALTER TABLE data ENABLE ROW LEVEL SECURITY;

-- Règle 1 : tout le monde peut LIRE (SELECT)
CREATE POLICY "Lecture publique"
ON data
FOR SELECT
TO anon
USING (true);

-- Règle 2 : tout le monde peut AJOUTER (INSERT)
CREATE POLICY "Ajout public"
ON data
FOR INSERT
TO anon
WITH CHECK (true);

-- Règle 3 : tout le monde peut MODIFIER (UPDATE)
CREATE POLICY "Modification publique"
ON data
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Règle 4 : tout le monde peut SUPPRIMER (DELETE)
CREATE POLICY "Suppression publique"
ON data
FOR DELETE
TO anon
USING (true);
```

> **`TO anon`** = cette règle s'applique aux utilisateurs non connectés (anonymes), c'est-à-dire tous tes visiteurs.
>
> **`USING (true)`** = la condition est toujours vraie = tout le monde est autorisé.

### ⚠️ Sécurité

Cette config est ouverte : n'importe qui avec l'URL de ton site peut ajouter ou supprimer des données. Pour ton usage entre amis c'est OK. Si un jour tu veux restreindre, tu pourras ajouter un système d'authentification Supabase.

---

## 6. Récupérer tes clés

1. Va dans **Settings** (roue dentée, menu de gauche)
2. Clique **API**
3. Tu y trouves :
   - **Project URL** : quelque chose comme `https://abcdefghij.supabase.co`
   - **anon / public key** : une longue chaîne commençant par `eyJ...`

Copie ces deux valeurs et colle-les dans le fichier `rqc.html` aux lignes indiquées :

```javascript
const SUPABASE_URL = 'https://abcdefghij.supabase.co';       // ← ta vraie URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUz...longue chaîne';  // ← ta vraie clé
```

---

## 7. Ce qui change dans le code (et pourquoi)

### 7.1 — Ajout de la librairie Supabase

```html
<!-- AVANT : rien -->

<!-- APRÈS : on charge le client Supabase depuis un CDN -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

**Pourquoi** : cette librairie fournit l'objet `supabase` avec des méthodes simples (`.from()`, `.select()`, `.insert()`, `.delete()`) pour parler à ta base en ligne. Sans elle, il faudrait écrire des `fetch()` bruts avec des headers HTTP — beaucoup plus compliqué.

### 7.2 — Initialisation

```javascript
// AVANT (IndexedDB) :
const dbRequest = indexedDB.open("bd_rqc", 1);
dbRequest.onupgradeneeded = function (e) { ... };
dbRequest.onsuccess = function (e) { db = e.target.result; };

// APRÈS (Supabase) :
const SUPABASE_URL = 'https://XXXXXXXXXX.supabase.co';
const SUPABASE_ANON_KEY = 'eyXXXXXXXXXX';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

**Pourquoi** : avec IndexedDB, il fallait ouvrir la base, gérer les versions, créer les object stores... Avec Supabase, une seule ligne crée le client. La base existe déjà côté serveur.

### 7.3 — Enregistrement (INSERT)

```javascript
// AVANT (IndexedDB) :
const req = indexedDB.open("bd_rqc", 1);
req.onsuccess = function (e) {
    const database = e.target.result;
    const tx = database.transaction("data", "readwrite");
    const store = tx.objectStore("data");
    store.add(donnees);
    tx.oncomplete = function () { alert("OK !"); };
    tx.onerror = function () { alert("Erreur"); };
};

// APRÈS (Supabase) :
const { data, error } = await supabase
    .from('data')
    .insert([donnees]);

if (error) alert("Erreur : " + error.message);
else alert("OK !");
```

**Pourquoi c'est mieux** :
- **3 lignes** au lieu de 10
- **`await`** = on attend la réponse du serveur (plus besoin de callbacks imbriquées)
- **`error`** est un objet avec un message clair si ça échoue
- Les données partent sur internet et sont stockées côté Supabase → visibles par tous

### 7.4 — Lecture (SELECT)

```javascript
// AVANT (IndexedDB) :
const store = tx.objectStore("data");
const getAll = store.getAll();
getAll.onsuccess = function () {
    const data = getAll.result;
    // ... traitement
};

// APRÈS (Supabase) :
const { data, error } = await supabase
    .from('data')
    .select('*')
    .order('id', { ascending: true });
```

**Pourquoi** : `select('*')` ramène toutes les colonnes. `.order('id', ...)` trie les résultats. Le résultat `data` est déjà un tableau JavaScript identique à ce que te donnait `getAll()`.

### 7.5 — Suppression (DELETE)

```javascript
// AVANT (IndexedDB) :
store.delete(id);

// APRÈS (Supabase) :
await supabase.from('data').delete().eq('id', id);
```

**Pourquoi** : `.eq('id', id)` est l'équivalent de `WHERE id = 5` en SQL. On supprime uniquement la ligne correspondante.

### 7.6 — Export (backup)

L'export est conservé mais simplifié : on lit tout depuis Supabase et on le télécharge en JSON. C'est maintenant un backup optionnel, pas le flux principal.

### 7.7 — Import supprimé

Plus besoin ! Les données sont en ligne. Si tu veux importer tes anciennes données, voir la section 8.

### 7.8 — Page d'accueil mise à jour

Le texte d'explication a été mis à jour pour refléter le nouveau fonctionnement (plus de mention d'import/export OneDrive). Un badge de statut de connexion a été ajouté.

---

## 8. Importer tes données existantes

Si tu as un fichier `bd_rqc.json` exporté depuis l'ancienne version, tu peux l'importer dans Supabase :

### Option A : Via le dashboard Supabase

1. Va dans **Table Editor** → table `data`
2. Clique **"Insert"** → **"Import data from CSV"**
3. Convertis ton JSON en CSV (utilise un outil en ligne comme https://konklone.io/json/ ou demande-moi)
4. Uploade le CSV

### Option B : Via le SQL Editor

1. Va dans **SQL Editor**
2. Pour chaque entrée, exécute :

```sql
INSERT INTO data (prix, volume, degre, magasin, type_alcool, references, ville, volume_alcool, masse_alcool, rqc, prix_litre)
VALUES (12.50, 70, 40, 'Carrefour', 'Vodka', 'Poliakov 70cL', 'Metz', 28, 220.92, 44.64, 17.86);
```

### Option C : Via JavaScript (temporaire)

Ajoute temporairement ce code dans la console du navigateur (F12 → Console) après avoir ouvert ton nouveau site :

```javascript
// Colle ici le contenu de ton ancien bd_rqc.json
const anciennesDonnees = [ /* ... */ ];

for (const item of anciennesDonnees) {
    const { error } = await supabase.from('data').insert([item]);
    if (error) console.error('Erreur:', error);
}
console.log('Import terminé !');
```

---

## 9. Déployer sur GitHub Pages

1. Remplace ton ancien `rqc.html` par le nouveau dans ton repo GitHub
2. **Vérifie que tes clés Supabase sont bien renseignées** dans le code
3. Commit et push :

```bash
git add rqc.html
git commit -m "Migration vers Supabase"
git push
```

4. GitHub Pages se met à jour automatiquement (attends 1-2 min)
5. Ouvre ton site et vérifie que le badge affiche "✅ Base de données en ligne"

---

## 10. Résumé : IndexedDB vs Supabase

| Aspect               | IndexedDB (avant)                | Supabase (après)                     |
|----------------------|----------------------------------|--------------------------------------|
| **Où sont les données** | Dans le navigateur de chaque utilisateur | Sur un serveur en ligne (cloud) |
| **Partage**          | Manuel (export JSON → OneDrive → import) | Automatique et en temps réel |
| **Persistance**      | Disparaît si cache vidé          | Permanent tant que le projet existe |
| **Accès multi-appareil** | Non                          | Oui                                  |
| **Besoin de backend** | Non                             | Non (API REST fournie)               |
| **Coût**             | Gratuit                          | Gratuit (tier gratuit Supabase)      |
| **Limites gratuites** | Illimité (local)                | 500 Mo, 50k requêtes/mois           |
| **Syntaxe JS**       | Verbeux (transactions, callbacks) | Simple (async/await, 2-3 lignes)    |

---

## Aide-mémoire des commandes Supabase en JS

```javascript
// LIRE tout
const { data } = await supabase.from('data').select('*');

// LIRE avec filtre
const { data } = await supabase.from('data').select('*').eq('ville', 'Metz');

// AJOUTER
const { error } = await supabase.from('data').insert([{ prix: 12, ... }]);

// MODIFIER
const { error } = await supabase.from('data').update({ prix: 15 }).eq('id', 42);

// SUPPRIMER
const { error } = await supabase.from('data').delete().eq('id', 42);

// COMPTER
const { count } = await supabase.from('data').select('*', { count: 'exact' });

// TRIER
const { data } = await supabase.from('data').select('*').order('rqc', { ascending: true });
```

---

*Guide rédigé pour le projet rQC — Juin 2026*
