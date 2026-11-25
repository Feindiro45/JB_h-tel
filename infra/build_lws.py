"""Assemble la livraison LWS sans copier les secrets ni modifier le backend local."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import uuid
import zipfile


ROOT = Path(__file__).resolve().parent.parent
API = "https://banguiweb-tech.com/backend"


def run(command, cwd, env=None):
    subprocess.run(command, cwd=cwd, env=env, check=True)


def archive(source, target):
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        for path in sorted(source.rglob("*")):
            relative = path.relative_to(source).as_posix()
            if path.is_symlink():
                raise RuntimeError(f"Lien symbolique inattendu : {relative}")
            if path.is_dir():
                output.write(path, relative + "/")
            else:
                if path.name.startswith(".env") or path.suffix in {".sql", ".sqlite", ".log"}:
                    raise RuntimeError(f"Fichier privé inattendu : {relative}")
                output.write(path, relative)
    with zipfile.ZipFile(target) as check:
        if check.testzip() is not None:
            raise RuntimeError(f"Archive corrompue : {target.name}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", required=True, help="Date de livraison YYYY-MM-DD")
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.date):
        parser.error("Date attendue : YYYY-MM-DD")
    release = ROOT / "output" / "lws" / f"livraison-{args.date}-{uuid.uuid4().hex[:8]}"
    release.mkdir(parents=True, exist_ok=False)
    public = release / "staging" / "htdocs"
    private = release / "staging" / "jb-hotel-backend"

    env = dict(os.environ, VITE_API_URL=API, VITE_TIMEZONE="Africa/Bangui")
    run([shutil.which("npm"), "run", "build"], ROOT / "frontend", env)
    shutil.copytree(ROOT / "frontend" / "dist", public)
    shutil.copytree(ROOT / "infra" / "lws" / "backend-public", public / "backend")
    if {p.name for p in (public / "backend").iterdir()} != {".htaccess", "index.php"}:
        raise RuntimeError("Le dossier backend public doit contenir exactement deux fichiers")
    bundles = list((public / "assets").glob("*.js"))
    if not any(API in p.read_text(encoding="utf-8") for p in bundles):
        raise RuntimeError("Adresse API absente du build")
    index = (public / "index.html").read_text(encoding="utf-8")
    for asset in re.findall(r'(?:src|href)="(/assets/[^\"]+)"', index):
        if not (public / asset.lstrip("/")).is_file():
            raise RuntimeError(f"Asset manquant : {asset}")

    private.mkdir(parents=True)
    source = ROOT / "backend"
    ignore = shutil.ignore_patterns(".env*", "*.log", "*.sql", "*.sqlite", "node_modules", ".git")
    for folder in ("app", "config", "lang", "resources", "routes", "public"):
        shutil.copytree(source / folder, private / folder, ignore=ignore)
    for folder in ("factories", "migrations", "seeders"):
        shutil.copytree(source / "database" / folder, private / "database" / folder, ignore=ignore)
    for name in ("artisan", "composer.json", "composer.lock"):
        shutil.copy2(source / name, private / name)
    (private / "bootstrap" / "cache").mkdir(parents=True)
    for name in ("app.php", "providers.php"):
        shutil.copy2(source / "bootstrap" / name, private / "bootstrap" / name)
    for folder in ("app/private", "app/public", "framework/cache/data", "framework/sessions", "framework/views", "logs"):
        (private / "storage" / folder).mkdir(parents=True)

    # Installation isolée : le vendor de développement et le .env de travail restent intacts.
    run([shutil.which("composer"), "install", "--no-dev", "--prefer-dist", "--optimize-autoloader", "--no-interaction", "--no-scripts"], private)
    run([shutil.which("composer"), "check-platform-reqs", "--no-dev"], private)
    installed = json.loads((private / "vendor/composer/installed.json").read_text(encoding="utf-8"))
    lock = json.loads((source / "composer.lock").read_text(encoding="utf-8"))
    if installed["dev"] or {p["name"] for p in installed["packages"]} != {p["name"] for p in lock["packages"]}:
        raise RuntimeError("Le vendor doit correspondre exactement aux dépendances de production verrouillées")
    for path in list((private / "vendor").rglob(".env*")):
        if path.is_file():
            path.unlink()
    build_env = dict(os.environ, APP_ENV="production", APP_DEBUG="false", DB_CONNECTION="sqlite", DB_DATABASE=":memory:", CACHE_STORE="array", SESSION_DRIVER="array", MAIL_MAILER="array")
    run([shutil.which("php"), "artisan", "package:discover", "--ansi"], private, build_env)
    routes = subprocess.run([shutil.which("php"), "artisan", "route:list", "--except-vendor", "--json"], cwd=private, env=build_env, check=True, capture_output=True, text=True, encoding="utf-8")
    print(f"Routes applicatives chargées : {len(json.loads(routes.stdout))}", flush=True)
    # Ces manifestes sont régénérés sur le serveur, avec ses chemins et sa configuration.
    for path in (private / "bootstrap/cache").glob("*.php"):
        path.unlink()

    files = []
    for folder, name, destination in (
        (public, "jb-hotel-public.zip", "/htdocs/"),
        (private, "jb-hotel-backend-prive.zip", "/home/jb-hotel-backend/"),
    ):
        target = release / name
        archive(folder, target)
        files.append({"archive": name, "destination": destination, "bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
    manifest = {"date": args.date, "api": API, "backend_prive": "/home/jb-hotel-backend", "secrets_inclus": False, "archives": files}
    (release / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (release / "SHA256SUMS.txt").write_text("".join(f"{f['sha256']}  {f['archive']}\n" for f in files), encoding="utf-8")
    shutil.copy2(ROOT / "docs/LIVRAISON_LWS_HOME.md", release / "INSTALLATION.md")
    print("\nLIVRAISON=" + str(release), flush=True)
    print(json.dumps(manifest, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
