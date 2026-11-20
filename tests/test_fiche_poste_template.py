"""La fiche de poste se rend même quand on passe la racine du dépôt."""

from pathlib import Path

from backend.services.export_package import _fiche_base_dir, _render_fiche_html

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_fiche_base_dir_resolves_repo_root_to_documents():
    found = _fiche_base_dir(REPO_ROOT)
    assert found.name == "documents"
    assert (found / "fiche_poste_template.html").is_file()


def test_fiche_base_dir_keeps_a_directory_that_already_has_the_template(tmp_path):
    (tmp_path / "fiche_poste_template.html").write_text("<p>{{ poste }}</p>", encoding="utf-8")
    assert _fiche_base_dir(tmp_path) == tmp_path.resolve()


def test_render_fiche_html_from_repo_root():
    html, filename = _render_fiche_html(
        "Développer l'API",
        "Backend",
        "Axel",
        _fiche_base_dir(REPO_ROOT),
    )
    assert "Backend" in html
    assert "Axel" in html
    assert "Développer" in html
    assert filename.startswith("Fiche de poste")
