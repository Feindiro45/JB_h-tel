"""Prépare les deux applications de JB Hôtel dans ce dossier, prêtes à être mises en ligne.

Architecture visée (PROMPT_CONFIGURATION_JB_HOTEL.md, section 2) :

    https://app.jb-hotel.com  ->  deploiement/frontend          (contenu du build React)
    https://api.jb-hotel.com  ->  deploiement/backend/public    (racine publique de Laravel)

Le script ne déploie rien et ne touche ni au backend local, ni à son `.env`, ni à son `vendor` :
il copie, construit et vérifie dans `deploiement/`. Aucun secret n'est copié.

Variante mono-domaine (frontend et API sur banguiweb-tech.com, API dans un sous-dossier) :
voir `infra/build_lws.py`, qui reste l'outil de cette livraison-là.

    python deploiement/preparer.py
    python deploiement/preparer.py --api-url https://api.exemple.com --app-url https://app.exemple.com
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

DOSSIER = Path(__file__).resolve().parent
RACINE = DOSSIER.parent

# Dossiers et fichiers du projet Laravel nécessaires en production. `tests`, `phpunit.xml`,
# `phpstan.neon` et le `vendor` de développement n'ont rien à faire sur le serveur.
BACKEND_DOSSIERS = ("app", "bootstrap", "config", "database", "lang", "public", "resources", "routes")
BACKEND_FICHIERS = ("artisan", "composer.json", "composer.lock")
BACKEND_IGNORES = shutil.ignore_patterns(
    ".env*", "*.log", "*.sql", "*.sqlite", "*.zip", "node_modules", ".git", "cache", "__pycache__"
)
# `storage` est recréé vide : les sessions, caches et journaux locaux ne sont pas des livrables.
STORAGE_DOSSIERS = (
    "app/private",
    "app/public",
    "framework/cache/data",
    "framework/sessions",
    "framework/testing",
    "framework/views",
    "logs",
)
# Seul modèle d'environnement autorisé dans la livraison ; tout autre `.env*` serait un secret.
ENV_MODELE = ".env.production.example"


def outil(nom: str) -> str:
    chemin = shutil.which(nom)
    if chemin is None:
        raise SystemExit(f"Outil introuvable dans le PATH : {nom}")
    return chemin


def executer(commande: list[str], cwd: Path, env: dict[str, str] | None = None) -> None:
    print(f"\n$ {' '.join(Path(commande[0]).name if i == 0 else a for i, a in enumerate(commande))}", flush=True)
    subprocess.run(commande, cwd=cwd, env=env, check=True)


def ecrire_lf(cible: Path, contenu: str) -> None:
    """Écrit un fichier en UTF-8 avec des fins de ligne LF, comme l'attend un serveur Linux."""
    cible.write_bytes(contenu.replace("\r\n", "\n").encode("utf-8"))


def vider(dossier: Path) -> None:
    """Recrée un dossier vide. Sous Windows, un fichier en lecture seule bloque la suppression."""
    def forcer(fonction, chemin, _exception):
        os.chmod(chemin, 0o700)
        fonction(chemin)

    if dossier.exists():
        shutil.rmtree(dossier, onexc=forcer)
    dossier.mkdir(parents=True)


def preparer_frontend(cible: Path, api_url: str) -> None:
    """Construit React avec l'adresse de production et copie `dist` dans la cible."""
    source = RACINE / "frontend"
    if not (source / "node_modules").is_dir():
        raise SystemExit("frontend/node_modules absent : lancer « npm install » dans frontend/.")

    # Vite donne la priorité aux variables VITE_* réelles sur les fichiers .env : le build ne
    # dépend donc pas de frontend/.env.production.local (livraison mono-domaine) et ne le modifie pas.
    env = dict(os.environ, VITE_API_URL=api_url, VITE_TIMEZONE="Africa/Bangui")
    executer([outil("npm"), "run", "build"], source, env)

    dist = source / "dist"
    vider(cible)
    shutil.copytree(dist, cible, dirs_exist_ok=True)

    # Le .htaccess de public/ vise la livraison mono-domaine : le remplacer par celui du sous-domaine.
    modele = DOSSIER / "modeles" / "app-jb-hotel.htaccess"
    ecrire_lf(cible / ".htaccess", modele.read_text(encoding="utf-8"))

    verifier_frontend(cible, api_url)


def verifier_frontend(cible: Path, api_url: str) -> None:
    """Refuse une livraison frontend incomplète ou construite avec la mauvaise adresse d'API."""
    bundles = list((cible / "assets").glob("*.js"))
    if not bundles:
        raise SystemExit("Aucun script dans assets/ : le build React a échoué.")
    if not any(api_url in b.read_text(encoding="utf-8", errors="ignore") for b in bundles):
        raise SystemExit(f"Adresse d'API absente du build : {api_url}")
    # Preuve que la variable d'environnement a bien eu la priorité sur frontend/.env.production.local
    # (livraison mono-domaine). `http://localhost:8000` reste présent : c'est le repli de
    # shared/config.ts, utilisé seulement si aucune adresse n'est fournie au build.
    if any("banguiweb-tech.com" in b.read_text(encoding="utf-8", errors="ignore") for b in bundles):
        raise SystemExit("Le build contient l'adresse de la livraison mono-domaine : vérifier les fichiers .env.")

    index = (cible / "index.html").read_text(encoding="utf-8")
    for asset in re.findall(r'(?:src|href)="(/[^"]+)"', index):
        if not (cible / asset.lstrip("/")).is_file():
            raise SystemExit(f"Fichier référencé par index.html absent : {asset}")

    for attendu in ("index.html", ".htaccess", "sw.js", "manifest.webmanifest", "icons/icon-512.png"):
        if not (cible / attendu).is_file():
            raise SystemExit(f"Fichier manquant dans la livraison frontend : {attendu}")


def proteger_racine(cible: Path) -> None:
    """Protège la racine du projet si l'hébergeur l'expose (section 10 du prompt).

    Les règles sont celles de `infra/lws/api-root.htaccess`, seule source de vérité : seul son
    en-tête, écrit pour la livraison mono-domaine, est remplacé. Quand la racine web est bien
    `public/`, Apache ne lit jamais ce fichier : il ne sert que de filet de sécurité.
    """
    lignes = (RACINE / "infra" / "lws" / "api-root.htaccess").read_text(encoding="utf-8").splitlines()
    regles = "\n".join(lignes[2:]).lstrip("\n") if lignes[0].startswith("# LWS Panel") else "\n".join(lignes)
    entete = (
        "# JB Hôtel — protection de la racine du projet Laravel.\n"
        "# api.jb-hotel.com doit pointer sur le dossier « public ». Si l'hébergeur expose malgré tout\n"
        "# cette racine, ces règles refusent les fichiers cachés (dont .env) et renvoient tout vers\n"
        "# public/. Règles partagées avec infra/lws/api-root.htaccess.\n"
        "# Le dossier public garde son propre .htaccess, fourni avec Laravel.\n\n"
    )
    ecrire_lf(cible / ".htaccess", entete + regles)


def preparer_backend(cible: Path) -> None:
    """Copie le projet Laravel sans secrets et installe les dépendances de production."""
    source = RACINE / "backend"
    vider(cible)

    for dossier in BACKEND_DOSSIERS:
        shutil.copytree(source / dossier, cible / dossier, ignore=BACKEND_IGNORES)
    for fichier in BACKEND_FICHIERS:
        shutil.copy2(source / fichier, cible / fichier)

    # `bootstrap/cache` est copié vide : les manifestes sont régénérés sur le serveur, avec ses chemins.
    (cible / "bootstrap" / "cache").mkdir(parents=True, exist_ok=True)
    ecrire_lf(cible / "bootstrap" / "cache" / ".gitignore", "*\n!.gitignore\n")
    for dossier in STORAGE_DOSSIERS:
        (cible / "storage" / dossier).mkdir(parents=True, exist_ok=True)

    proteger_racine(cible)
    shutil.copy2(DOSSIER / "modeles" / "backend.env.production.example", cible / ENV_MODELE)

    # Installation isolée : ni le vendor de développement ni le .env de travail ne sont touchés.
    executer(
        [outil("composer"), "install", "--no-dev", "--prefer-dist", "--optimize-autoloader",
         "--no-interaction", "--no-scripts"],
        cible,
    )
    executer([outil("composer"), "check-platform-reqs", "--no-dev"], cible)
    verifier_backend(cible, source)


def verifier_backend(cible: Path, source: Path) -> int:
    """Vérifie que le vendor correspond aux dépendances verrouillées et que Laravel démarre."""
    installe = json.loads((cible / "vendor/composer/installed.json").read_text(encoding="utf-8"))
    verrou = json.loads((source / "composer.lock").read_text(encoding="utf-8"))
    if installe["dev"]:
        raise SystemExit("Le vendor contient des dépendances de développement.")
    if {p["name"] for p in installe["packages"]} != {p["name"] for p in verrou["packages"]}:
        raise SystemExit("Le vendor ne correspond pas aux dépendances de production verrouillées.")

    for chemin in (cible / "vendor").rglob(".env*"):
        if chemin.is_file():
            chemin.unlink()

    for interdit in (cible / "tests", cible / "phpunit.xml", cible / ".env"):
        if interdit.exists():
            raise SystemExit(f"Fichier qui ne doit pas être livré : {interdit.name}")

    # Démarrage à blanc : aucune base, aucun envoi d'e-mail, aucune écriture en production.
    env = dict(
        os.environ, APP_ENV="production", APP_DEBUG="false",
        DB_CONNECTION="sqlite", DB_DATABASE=":memory:",
        CACHE_STORE="array", SESSION_DRIVER="array", QUEUE_CONNECTION="sync", MAIL_MAILER="array",
    )
    executer([outil("php"), "artisan", "package:discover", "--ansi"], cible, env)
    routes = subprocess.run(
        [outil("php"), "artisan", "route:list", "--except-vendor", "--json"],
        cwd=cible, env=env, check=True, capture_output=True, text=True, encoding="utf-8",
    )
    nombre = len(json.loads(routes.stdout))
    print(f"Routes applicatives chargées : {nombre}", flush=True)

    # Ces manifestes dépendent des chemins du serveur : ils y seront reconstruits.
    for chemin in (cible / "bootstrap/cache").glob("*.php"):
        chemin.unlink()
    return nombre


def archiver(source: Path, cible: Path) -> None:
    """Archive un dossier en refusant tout secret, lien symbolique ou journal."""
    with zipfile.ZipFile(cible, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as sortie:
        for chemin in sorted(source.rglob("*")):
            relatif = chemin.relative_to(source).as_posix()
            if chemin.is_symlink():
                raise SystemExit(f"Lien symbolique inattendu : {relatif}")
            if chemin.is_dir():
                sortie.write(chemin, relatif + "/")
                continue
            if chemin.name.startswith(".env") and chemin.name != ENV_MODELE:
                raise SystemExit(f"Fichier privé inattendu : {relatif}")
            if chemin.suffix in {".sql", ".sqlite", ".log"}:
                raise SystemExit(f"Fichier privé inattendu : {relatif}")
            sortie.write(chemin, relatif)
    with zipfile.ZipFile(cible) as controle:
        if controle.testzip() is not None:
            raise SystemExit(f"Archive corrompue : {cible.name}")


def mesurer(dossier: Path) -> tuple[int, int]:
    fichiers = [p for p in dossier.rglob("*") if p.is_file()]
    return len(fichiers), sum(p.stat().st_size for p in fichiers)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-url", default="https://api.jb-hotel.com", help="Racine publique de Laravel, sans /api")
    parser.add_argument("--app-url", default="https://app.jb-hotel.com", help="Adresse du frontend React")
    parser.add_argument("--sans-archives", action="store_true", help="Ne pas produire les fichiers .zip")
    args = parser.parse_args()

    for nom, valeur in (("--api-url", args.api_url), ("--app-url", args.app_url)):
        if not valeur.startswith("https://") or valeur.endswith("/"):
            parser.error(f"{nom} : adresse https sans barre oblique finale attendue.")
    if args.api_url.rstrip("/").endswith("/api"):
        parser.error(
            "--api-url est la racine publique de Laravel, sans « /api » : le client ajoute lui-même "
            "« /api/v1/... » et appelle « /sanctum/csrf-cookie » hors de ce préfixe."
        )

    frontend, backend = DOSSIER / "frontend", DOSSIER / "backend"
    print(f"Frontend  {args.app_url}  ->  {frontend}")
    print(f"Backend   {args.api_url}  ->  {backend / 'public'}")

    preparer_frontend(frontend, args.api_url)
    preparer_backend(backend)

    archives = []
    if not args.sans_archives:
        dossier_archives = DOSSIER / "archives"
        vider(dossier_archives)
        for source, nom, destination in (
            (frontend, "jb-hotel-frontend.zip", "racine de app.jb-hotel.com"),
            (backend, "jb-hotel-backend.zip", "dossier du projet Laravel (api.jb-hotel.com -> public/)"),
        ):
            cible = dossier_archives / nom
            archiver(source, cible)
            archives.append({
                "archive": nom,
                "destination": destination,
                "octets": cible.stat().st_size,
                "sha256": hashlib.sha256(cible.read_bytes()).hexdigest(),
            })

    manifeste = {
        "prepare_le": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "app_url": args.app_url,
        "api_url": args.api_url,
        "secrets_inclus": False,
        "frontend": dict(zip(("fichiers", "octets"), mesurer(frontend))),
        "backend": dict(zip(("fichiers", "octets"), mesurer(backend))),
        "archives": archives,
    }
    ecrire_lf(DOSSIER / "MANIFESTE.json", json.dumps(manifeste, ensure_ascii=False, indent=2) + "\n")
    if archives:
        # Fins de ligne LF : `sha256sum -c` sous Linux doit pouvoir relire ce fichier.
        ecrire_lf(DOSSIER / "SHA256SUMS.txt",
                  "".join(f"{a['sha256']}  {a['archive']}\n" for a in archives))
    print("\n" + json.dumps(manifeste, ensure_ascii=False, indent=2), flush=True)
    print("\nPréparation terminée. Mise en ligne : docs/deployment/03_DEPLOIEMENT_PRODUCTION.md")


if __name__ == "__main__":
    sys.exit(main())
