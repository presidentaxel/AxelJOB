"""AXE-1103 : l'export « dossier local » (écriture sur le disque du serveur) n'existe plus."""

from backend import main


def _paths() -> set[str]:
    return {getattr(r, "path", "") for r in main.app.routes}


def test_local_export_routes_removed():
    assert "/api/export-dossier" not in _paths()
    assert "/api/export-default-dir" not in _paths()


def test_zip_export_route_kept():
    assert "/api/export-dossier-zip" in _paths()
