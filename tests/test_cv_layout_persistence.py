"""
Tests de persistance du champ `layout` du CV (P2.3).

`save_cv_base` / `load_cv_base` doivent :
  1. Sauvegarder et relire un `layout` non vide a l identique.
  2. Preserver le `layout` existant si un nouveau payload ne contient
     pas la cle (compatibilite avec les vieux clients / route PATCH
     legacy).
  3. Ecraser le `layout` si le payload envoie explicitement une
     nouvelle valeur (y compris `None` pour revenir au defaut).

Le stockage est un faux client Supabase : plus de fichier `cv_base.json`.
"""

from __future__ import annotations

import pytest

from backend import db


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, store):
        self.store = store
        self.row_id = None
        self.payload = None
        self.op = None

    def select(self, *_args, **_kwargs):
        self.op = "select"
        return self

    def eq(self, _key, value):
        self.row_id = value
        return self

    def limit(self, _n):
        return self

    def upsert(self, payload, on_conflict="id"):
        self.op = "upsert"
        self.payload = payload
        return self

    def execute(self):
        if self.op == "upsert":
            self.store[self.payload["id"]] = self.payload["data"]
            return _Result([self.payload])
        row = self.store.get(self.row_id)
        if row is None:
            return _Result([])
        return _Result([{"data": row}])


class _Supabase:
    def __init__(self):
        self.store = {}

    def table(self, name):
        assert name == "cv_base"
        return _Query(self.store)


@pytest.fixture
def cv_store(monkeypatch):
    sb = _Supabase()
    monkeypatch.setattr(db, "USE_SUPABASE_PG", False)
    monkeypatch.setattr(db, "_get_supabase", lambda: sb)
    return sb.store


def test_save_then_load_preserves_layout(cv_store):
    layout = {
        "version": 1,
        "sectionsOrder": [
            "resume",
            "experiences",
            "formations",
            "competences",
            "certifications",
            "projets",
        ],
        "sidebarRatio": 35,
        "theme": "default",
    }
    db.save_cv_base({"prenom": "A", "nom": "B", "layout": layout})
    loaded = db.load_cv_base()
    assert loaded["layout"] == layout


def test_partial_save_preserves_existing_layout(cv_store):
    layout = {
        "version": 1,
        "sectionsOrder": ["experiences", "formations"],
        "sidebarRatio": 30,
        "theme": "default",
    }
    db.save_cv_base({"prenom": "A", "layout": layout})
    db.save_cv_base({"prenom": "A", "nom": "Updated"})
    loaded = db.load_cv_base()
    assert loaded["layout"] == layout
    assert loaded["nom"] == "Updated"


def test_explicit_null_layout_clears_persisted_value(cv_store):
    layout = {
        "version": 1,
        "sectionsOrder": ["experiences"],
        "sidebarRatio": 30,
        "theme": "default",
    }
    db.save_cv_base({"prenom": "A", "layout": layout})
    db.save_cv_base({"prenom": "A", "layout": None})
    loaded = db.load_cv_base()
    assert loaded.get("layout") is None


def test_layout_not_set_then_save_with_layout(cv_store):
    db.save_cv_base({"prenom": "A"})
    assert cv_store["default"].get("layout") is None
    layout = {
        "version": 1,
        "sectionsOrder": ["resume", "experiences"],
        "sidebarRatio": 30,
        "theme": "default",
    }
    db.save_cv_base({"prenom": "A", "layout": layout})
    assert db.load_cv_base()["layout"] == layout


def test_preservation_keeps_template_id_and_options(cv_store):
    db.save_cv_base(
        {
            "prenom": "A",
            "template_id": "executive",
            "template_options": {"primary_color": "#123456"},
        }
    )
    db.save_cv_base({"prenom": "A", "nom": "B"})
    loaded = db.load_cv_base()
    assert loaded["template_id"] == "executive"
    assert loaded["template_options"] == {"primary_color": "#123456"}


def test_without_supabase_does_not_touch_a_file(monkeypatch, tmp_path):
    monkeypatch.setattr(db, "_get_supabase", lambda: None)
    monkeypatch.chdir(tmp_path)
    with pytest.raises(RuntimeError, match="Supabase requis"):
        db.load_cv_base()
    with pytest.raises(RuntimeError, match="Supabase requis"):
        db.save_cv_base({"prenom": "A"})
    assert not (tmp_path / "cv_base.json").exists()
