"""Arma los manifiestos de winget de una release ya publicada.

Uso: python tools/winget_manifest.py v1.5.20 [carpeta]

Escribe los tres YAML en <carpeta>/manifests/n/Nethercap/TruckDash/<version>/,
el mismo arbol que microsoft/winget-pkgs, listo para subir en un PR a ese
repo. Sirve para la primera version; las siguientes las manda el workflow.

El hash sale del SHA256SUMS.txt de la release, que arma el mismo workflow que
compila el zip; con --verify baja el zip y lo comprueba.

Todo el texto va en ingles: lo lee cualquiera que busque en winget.
"""

import argparse
import hashlib
import json
import os
import sys
from urllib.request import Request, urlopen

REPO = "Nethercap/truck-companion"
PACKAGE_ID = "Nethercap.TruckDash"
MANIFEST_VERSION = "1.10.0"
ZIP_NAME = "TruckDash-windows.zip"
# Lo que se escribe en una terminal (o en Win+R) para abrirlo: winget no crea
# accesos directos en el menu Inicio para un portable.
ALIAS = "truckdash"

SHORT_DESCRIPTION = "Free GPS and second screen dashboard for Euro Truck Simulator 2 and American Truck Simulator."
DESCRIPTION = (
    "Truck Dash reads the game's telemetry on your PC and shows a live map with your route, "
    "speed, fuel, job and delivery time on a phone, tablet or second monitor through the browser. "
    "It works over the internet or on your own Wi-Fi without internet, needs no account and no admin "
    "rights, and installs the telemetry plugin for you. Free and open source (MIT)."
)
TAGS = ["ets2", "ats", "euro-truck-simulator-2", "american-truck-simulator",
        "telemetry", "dashboard", "gps", "trucksim", "second-screen"]


def _get(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "truckdash-winget-manifest"})
    with urlopen(req, timeout=60) as resp:
        return resp.read()


def release_info(tag: str) -> dict:
    return json.loads(_get(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}"))


def zip_sha256(tag: str, verify: bool = False) -> str:
    base = f"https://github.com/{REPO}/releases/download/{tag}"
    sums = _get(f"{base}/SHA256SUMS.txt").decode("ascii")
    sha = next((line.split()[0] for line in sums.splitlines()
                if line.strip().endswith(ZIP_NAME)), None)
    if not sha:
        raise SystemExit(f"{ZIP_NAME} is not in SHA256SUMS.txt of {tag}")
    if verify:
        actual = hashlib.sha256(_get(f"{base}/{ZIP_NAME}")).hexdigest()
        if actual.lower() != sha.lower():
            raise SystemExit(f"the zip does not match SHA256SUMS.txt ({actual} != {sha})")
    return sha.upper()


def manifests(version: str, sha: str, release_date: str) -> dict[str, str]:
    tag = f"v{version}"
    head = f"PackageIdentifier: {PACKAGE_ID}\nPackageVersion: {version}\n"

    def schema(kind: str) -> str:
        return f"# yaml-language-server: $schema=https://aka.ms/winget-manifest.{kind}.{MANIFEST_VERSION}.schema.json\n\n"

    version_yaml = (
        schema("version") + head
        + "DefaultLocale: en-US\n"
        + f"ManifestType: version\nManifestVersion: {MANIFEST_VERSION}\n"
    )
    installer_yaml = (
        schema("installer") + head
        + "InstallerType: zip\n"
        + "NestedInstallerType: portable\n"
        + "NestedInstallerFiles:\n"
        + "- RelativeFilePath: TruckDash.exe\n"
        + f"  PortableCommandAlias: {ALIAS}\n"
        + "MinimumOSVersion: 10.0.0.0\n"
        + (f"ReleaseDate: {release_date}\n" if release_date else "")
        + "Installers:\n"
        + "- Architecture: x64\n"
        + f"  InstallerUrl: https://github.com/{REPO}/releases/download/{tag}/{ZIP_NAME}\n"
        + f"  InstallerSha256: {sha}\n"
        + f"ManifestType: installer\nManifestVersion: {MANIFEST_VERSION}\n"
    )
    tags = "".join(f"- {t}\n" for t in TAGS)
    locale_yaml = (
        schema("defaultLocale") + head
        + "PackageLocale: en-US\n"
        + "Publisher: Nethercap\n"
        + "PublisherUrl: https://github.com/Nethercap\n"
        + f"PublisherSupportUrl: https://github.com/{REPO}/issues\n"
        + "PrivacyUrl: https://trucksim-dash.com/privacy.html\n"
        + "Author: Nethercap\n"
        + "PackageName: Truck Dash\n"
        + "PackageUrl: https://trucksim-dash.com/\n"
        + "License: MIT\n"
        + f"LicenseUrl: https://github.com/{REPO}/blob/main/LICENSE\n"
        + "Copyright: Copyright (c) 2026 Nethercap (Truck Dash)\n"
        + f"ShortDescription: {SHORT_DESCRIPTION}\n"
        + f"Description: {DESCRIPTION}\n"
        + "Moniker: truckdash\n"
        + "Tags:\n" + tags
        + f"ReleaseNotesUrl: https://github.com/{REPO}/releases/tag/{tag}\n"
        + f"ManifestType: defaultLocale\nManifestVersion: {MANIFEST_VERSION}\n"
    )
    return {
        f"{PACKAGE_ID}.yaml": version_yaml,
        f"{PACKAGE_ID}.installer.yaml": installer_yaml,
        f"{PACKAGE_ID}.locale.en-US.yaml": locale_yaml,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("tag", help="release tag, v1.2.3")
    ap.add_argument("out", nargs="?", default="winget-out")
    ap.add_argument("--verify", action="store_true", help="download the zip and check its hash")
    args = ap.parse_args(argv)
    if not args.tag.startswith("v"):
        raise SystemExit("the tag must look like v1.2.3")
    version = args.tag[1:]
    info = release_info(args.tag)
    release_date = (info.get("published_at") or "")[:10]
    sha = zip_sha256(args.tag, verify=args.verify)
    carpeta = os.path.join(args.out, "manifests", "n", *PACKAGE_ID.split("."), version)
    os.makedirs(carpeta, exist_ok=True)
    for nombre, texto in manifests(version, sha, release_date).items():
        with open(os.path.join(carpeta, nombre), "w", encoding="utf-8", newline="\n") as f:
            f.write(texto)
    print(carpeta)
    return 0


if __name__ == "__main__":
    sys.exit(main())
