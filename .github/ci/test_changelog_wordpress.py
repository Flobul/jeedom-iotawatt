#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import changelog_wordpress as c


CHANGELOG = """# Historique des versions — Test

## Non publié

- Une évolution future.

## Version 1.2.3 (18/10/2026)

- Correction visible.

## Version 1.2.2 (01/10/2026)

- Version précédente.
"""


def make_post(content: str, modified: str = "2026-10-18T10:00:00") -> c.WordPressPost:
    protected = {
        "link": "https://example.test/changelog/",
        "slug": "changelog",
        "status": "publish",
        "type": "post",
        "title": {"raw": "Historique"},
    }
    return c.WordPressPost(
        post_id=42,
        rest_base="posts",
        canonical_url="https://example.test/changelog/",
        slug="changelog",
        status="publish",
        content_raw=content,
        modified_gmt=modified,
        etag='"abc"',
        last_modified="Sun, 18 Oct 2026 10:00:00 GMT",
        protected=protected,
    )


class RepositoryFixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "docs").mkdir()
        (self.root / "plugin_info").mkdir()
        (self.root / "docs" / "CHANGELOG.md").write_text(CHANGELOG, encoding="utf-8")
        (self.root / "plugin_info" / "info.json").write_text(
            json.dumps(
                {
                    "id": "testplugin",
                    "pluginVersion": "1.2.3",
                    "changelog": "https://example.test/changelog/",
                }
            ),
            encoding="utf-8",
        )

    def tearDown(self):
        self.temporary.cleanup()


class ChangelogParsingTests(RepositoryFixture):
    def test_extracts_one_version_without_unreleased(self):
        repository = c.load_repository(self.root)
        entry = c.get_release_entry(repository, "v1.2.3")
        self.assertEqual(entry.version, "1.2.3")
        self.assertIn("Correction visible", entry.markdown)
        self.assertNotIn("Non publié", entry.markdown)
        self.assertNotIn("évolution future", entry.markdown)

    def test_version_must_match_plugin_info(self):
        repository = c.load_repository(self.root)
        with self.assertRaisesRegex(c.ChangelogError, "pluginVersion"):
            c.get_release_entry(repository, "1.2.2")

    def test_prepare_requires_explicit_non_empty_notes(self):
        c.prepare_release(self.root, "1.3.0", "18/10/2026")
        updated = (self.root / "docs" / "CHANGELOG.md").read_text(encoding="utf-8")
        self.assertIn("## Non publié\n\n- Aucun changement pour le moment.", updated)
        self.assertIn("## Version 1.3.0 (18/10/2026)\n\n- Une évolution future.", updated)
        self.assertIn("## Version 1.2.2 (01/10/2026)", updated)


class ConversionAndPreservationTests(unittest.TestCase):
    def setUp(self):
        self.entry = c.ReleaseEntry("1.2.3", "18/10/2026", "## Version 1.2.3 (18/10/2026)\n\n- Correction visible.")

    def test_detects_supported_wordpress_formats(self):
        self.assertEqual(c.detect_wordpress_format("<h2>Ancien</h2><p>Texte</p>"), "html")
        self.assertEqual(c.detect_wordpress_format("## Ancien\n\n- Texte"), "markdown")
        gutenberg = "<!-- wp:paragraph -->\n<p>Texte</p>\n<!-- /wp:paragraph -->"
        self.assertEqual(c.detect_wordpress_format(gutenberg), "gutenberg")

    def test_refuses_ambiguous_or_malformed_formats(self):
        with self.assertRaises(c.ChangelogError):
            c.detect_wordpress_format("## Markdown\n<p>HTML</p>")
        with self.assertRaises(c.ChangelogError):
            c.detect_wordpress_format("<!-- wp:paragraph --><p>sans fermeture</p>")
        with self.assertRaises(c.ChangelogError):
            c.detect_wordpress_format("texte sans structure")

    def test_renders_markdown_html_and_gutenberg(self):
        markdown = c.render_entry("testplugin", self.entry, "markdown")
        classic = c.render_entry("testplugin", self.entry, "html")
        blocks = c.render_entry("testplugin", self.entry, "gutenberg")
        self.assertIn("## Version 1.2.3", markdown)
        self.assertIn('<h2 id="version-1.2.3">', classic)
        self.assertTrue(blocks.startswith("<!-- wp:html -->"))
        for value in (markdown, classic, blocks):
            self.assertEqual(value.count("jeedom-changelog:testplugin:1.2.3:start"), 1)

    def test_old_article_is_preserved_byte_for_byte(self):
        original = "\n\n<p>Introduction</p>\n<!-- shortcode -->\n<p>Historique</p>\n"
        fragment = c.render_entry("testplugin", self.entry, "html")
        updated = c.prepend_entry(original, fragment)
        self.assertTrue(updated.endswith(original.lstrip()))
        self.assertIn("<p>Introduction</p>\n<!-- shortcode -->\n<p>Historique</p>", updated)

    def test_second_publication_and_manual_entry_are_not_duplicated(self):
        fragment = c.render_entry("testplugin", self.entry, "html")
        once = c.prepend_entry("<p>Ancien</p>", fragment)
        self.assertEqual(c.version_is_present(once, "testplugin", "1.2.3"), (True, "managed-marker"))
        manual = "<h2>Version 1.2.3 (18/10/2026)</h2><p>Déjà publié</p>"
        self.assertEqual(c.version_is_present(manual, "testplugin", "1.2.3"), (True, "manual-entry"))


class FakeClient:
    original = "<h2>Version 1.2.2 (01/10/2026)</h2><p>Ancien contenu</p>"
    content = original
    writes = 0

    def __init__(self, canonical_url, allowed_domain, username, password):
        if allowed_domain != "example.test":
            raise AssertionError("unexpected domain")
        self.post = make_post(type(self).content)

    def find_post(self):
        return self.post

    def read_post(self, post):
        return post

    def update_content(self, post, content):
        type(self).writes += 1
        type(self).content = content
        self.post = make_post(content, "2026-10-18T10:01:00")
        return self.post


class SynchronizationTests(RepositoryFixture):
    def test_dry_run_never_writes_and_creates_comparison(self):
        preview = self.root / "preview"
        FakeClient.writes = 0
        FakeClient.content = FakeClient.original
        with patch.object(c, "WordPressClient", FakeClient), patch.dict(
            os.environ, {"WP_USER": "reader", "WP_APP_PASSWORD": "secret"}
        ):
            c.sync(self.root, "example.test", "1.2.3", False, preview)
        self.assertEqual(FakeClient.writes, 0)
        before = (preview / "wordpress-before.txt").read_text(encoding="utf-8")
        after = (preview / "wordpress-after.txt").read_text(encoding="utf-8")
        summary = json.loads((preview / "summary.json").read_text(encoding="utf-8"))
        self.assertEqual(before, FakeClient.original)
        self.assertTrue(after.endswith(before))
        self.assertEqual(summary["mode"], "dry-run")
        self.assertTrue(summary["history_preserved"])

    def test_publish_is_idempotent_after_first_write(self):
        preview = self.root / "preview"
        FakeClient.writes = 0
        FakeClient.content = FakeClient.original
        with patch.object(c, "WordPressClient", FakeClient), patch.dict(
            os.environ, {"WP_USER": "writer", "WP_APP_PASSWORD": "secret"}
        ):
            c.sync(self.root, "example.test", "1.2.3", True, preview)
            c.sync(self.root, "example.test", "1.2.3", True, preview)
        self.assertEqual(FakeClient.writes, 1)
        self.assertEqual(
            FakeClient.content.count("jeedom-changelog:testplugin:1.2.3:start"), 1
        )

    def test_concurrent_modification_is_rejected(self):
        before = make_post("<p>avant</p>")
        changed = make_post("<p>modifié ailleurs</p>", "2026-10-18T10:00:01")
        with self.assertRaisesRegex(c.ChangelogError, "concurrently"):
            c.ensure_unchanged(before, changed)

    def test_api_outage_is_redacted(self):
        client = object.__new__(c.WordPressClient)
        client.host = "example.test"
        client.authorization = "Basic must-not-leak"

        class BrokenOpener:
            def open(self, request, timeout):
                raise URLError("private network detail")

        client.opener = BrokenOpener()
        with self.assertRaisesRegex(c.ChangelogError, "unavailable") as raised:
            client.request("GET", "https://example.test/wp-json/wp/v2/types")
        self.assertNotIn("must-not-leak", str(raised.exception))
        self.assertNotIn("private network", str(raised.exception))

    def test_incorrect_api_response_is_rejected(self):
        client = object.__new__(c.WordPressClient)
        response = c.ApiResponse({}, {}, "https://example.test", 200)
        with self.assertRaises(c.ChangelogError):
            client._post_from_response({"id": 42, "content": {}}, "posts", response)

    def test_update_sends_only_content_and_conditional_headers(self):
        client = object.__new__(c.WordPressClient)
        client.base_url = "https://example.test"
        captured = {}
        post = make_post("<p>avant</p>")

        def fake_request(method, url, payload=None, conditional_headers=None):
            captured.update(
                method=method,
                url=url,
                payload=payload,
                conditional_headers=conditional_headers,
            )
            item = {
                "id": 42,
                "link": post.canonical_url,
                "slug": post.slug,
                "status": post.status,
                "type": "post",
                "title": {"raw": "Historique"},
                "categories": None,
                "content": {"raw": "<p>après</p>"},
                "modified_gmt": "2026-10-18T10:01:00",
            }
            return c.ApiResponse(item, {}, url, 200)

        client.request = fake_request
        client.update_content(post, "<p>après</p>")
        self.assertEqual(captured["method"], "POST")
        self.assertEqual(captured["payload"], {"content": "<p>après</p>"})
        self.assertEqual(
            captured["conditional_headers"],
            {"If-Match": '"abc"', "If-Unmodified-Since": "Sun, 18 Oct 2026 10:00:00 GMT"},
        )
        self.assertIn("context=edit", captured["url"])

    def test_external_domain_is_rejected_before_authentication(self):
        with self.assertRaisesRegex(c.ChangelogError, "allowed domain"):
            c.WordPressClient(
                "https://attacker.invalid/changelog/",
                "example.test",
                "user",
                "application-password",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
