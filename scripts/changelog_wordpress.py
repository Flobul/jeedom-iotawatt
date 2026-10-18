#!/usr/bin/env python3
"""Validate, prepare and safely synchronize a Jeedom changelog with WordPress.

The repository source of truth is docs/CHANGELOG.md. Network synchronization is
read-only unless --publish is explicitly supplied to the ``sync`` command.
"""
from __future__ import annotations

import argparse
import base64
from dataclasses import dataclass
from datetime import datetime
import difflib
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse, urlunparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

import mistune

ROOT = Path(__file__).resolve().parents[1]
CHANGELOG_PATH = Path("docs/CHANGELOG.md")
INFO_PATH = Path("plugin_info/info.json")
PREVIEW_DIR = Path(".changelog-preview")
VERSION_HEADING_RE = re.compile(
    r"^## Version (?P<version>[0-9]+(?:\.[0-9]+)*) \((?P<date>\d{2}/\d{2}/\d{4})\)[ \t]*$",
    re.MULTILINE,
)
UNRELEASED_RE = re.compile(r"^## Non publi(?:é|e)[ \t]*$", re.MULTILINE | re.IGNORECASE)
SAFE_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
HTML_TAG_RE = re.compile(r"<(?:p|h[1-6]|ul|ol|li|div|section|article|br|table|blockquote)\b", re.I)
MARKDOWN_RE = re.compile(r"^(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+)", re.MULTILINE)


class ChangelogError(RuntimeError):
    """Expected validation, network or synchronization failure."""


@dataclass(frozen=True)
class ReleaseEntry:
    version: str
    date: str
    markdown: str


@dataclass(frozen=True)
class RepositoryData:
    plugin_id: str
    plugin_version: str
    changelog_url: str
    changelog_text: str
    entries: tuple[ReleaseEntry, ...]


@dataclass(frozen=True)
class ApiResponse:
    data: Any
    headers: dict[str, str]
    final_url: str
    status: int


@dataclass(frozen=True)
class WordPressPost:
    post_id: int
    rest_base: str
    canonical_url: str
    slug: str
    status: str
    content_raw: str
    modified_gmt: str
    etag: str
    last_modified: str
    protected: dict[str, Any]


def normalize_version(value: str) -> str:
    version = value.strip()
    if version.startswith(("v", "V")):
        version = version[1:]
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+)*", version):
        raise ChangelogError(f"Invalid version: {value!r}")
    return version


def normalize_canonical_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        raise ChangelogError("The changelog URL must be an absolute HTTPS URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ChangelogError("The changelog URL must not contain credentials, a query or a fragment")
    host = parsed.hostname.lower().rstrip(".")
    port = parsed.port
    if port not in (None, 443):
        raise ChangelogError("The changelog URL must use the standard HTTPS port")
    path = re.sub(r"/{2,}", "/", parsed.path or "/")
    if not path.endswith("/"):
        path += "/"
    return urlunparse(("https", host, path, "", "", ""))


def validate_allowed_domain(changelog_url: str, allowed_domain: str) -> str:
    canonical = normalize_canonical_url(changelog_url)
    actual = (urlparse(canonical).hostname or "").lower().rstrip(".")
    allowed = allowed_domain.strip().lower().rstrip(".")
    if not allowed or not re.fullmatch(r"[a-z0-9.-]+", allowed):
        raise ChangelogError("A valid --allowed-domain is required")
    if actual != allowed:
        raise ChangelogError(
            f"Refusing WordPress URL on {actual!r}; allowed domain is {allowed!r}"
        )
    return canonical


def parse_changelog(text: str) -> tuple[tuple[ReleaseEntry, ...], tuple[int, int]]:
    unreleased = list(UNRELEASED_RE.finditer(text))
    if len(unreleased) != 1:
        raise ChangelogError("docs/CHANGELOG.md must contain exactly one '## Non publié' section")
    headings = list(VERSION_HEADING_RE.finditer(text))
    if not headings:
        raise ChangelogError("No dated version entry found in docs/CHANGELOG.md")
    if unreleased[0].start() > headings[0].start():
        raise ChangelogError("The 'Non publié' section must precede every dated version")

    versions: set[str] = set()
    entries: list[ReleaseEntry] = []
    for index, match in enumerate(headings):
        version = normalize_version(match.group("version"))
        if version in versions:
            raise ChangelogError(f"Duplicate changelog version: {version}")
        versions.add(version)
        try:
            datetime.strptime(match.group("date"), "%d/%m/%Y")
        except ValueError as exc:
            raise ChangelogError(f"Invalid date for version {version}") from exc
        end = headings[index + 1].start() if index + 1 < len(headings) else len(text)
        markdown = text[match.start():end].strip()
        if not re.search(r"^[-*+]\s+\S", markdown, re.MULTILINE):
            raise ChangelogError(f"Version {version} has no user-facing changelog item")
        entries.append(ReleaseEntry(version, match.group("date"), markdown))

    unreleased_end = headings[0].start()
    unreleased_body_start = unreleased[0].end()
    return tuple(entries), (unreleased_body_start, unreleased_end)


def load_repository(root: Path) -> RepositoryData:
    try:
        info = json.loads((root / INFO_PATH).read_text(encoding="utf-8"))
        changelog_text = (root / CHANGELOG_PATH).read_text(encoding="utf-8")
    except (OSError, json.JSONDecodeError) as exc:
        raise ChangelogError(f"Cannot read repository metadata: {exc}") from exc

    plugin_id = str(info.get("id", "")).strip()
    if not SAFE_KEY_RE.fullmatch(plugin_id):
        raise ChangelogError("plugin_info/info.json contains an invalid plugin id")
    plugin_version = normalize_version(str(info.get("pluginVersion", "")))
    changelog_url = str(info.get("changelog", "")).strip()
    entries, _ = parse_changelog(changelog_text)
    return RepositoryData(plugin_id, plugin_version, changelog_url, changelog_text, entries)


def get_release_entry(repository: RepositoryData, requested_version: str) -> ReleaseEntry:
    version = normalize_version(requested_version)
    if repository.plugin_version != version:
        raise ChangelogError(
            f"pluginVersion {repository.plugin_version} does not match release {version}"
        )
    matches = [entry for entry in repository.entries if entry.version == version]
    if len(matches) != 1:
        raise ChangelogError(f"Release {version} must match exactly one dated changelog entry")
    return matches[0]


def prepare_release(root: Path, version_value: str, date_value: str) -> None:
    version = normalize_version(version_value)
    try:
        datetime.strptime(date_value, "%d/%m/%Y")
    except ValueError as exc:
        raise ChangelogError("--date must use DD/MM/YYYY and be a valid date") from exc

    path = root / CHANGELOG_PATH
    text = path.read_text(encoding="utf-8")
    entries, (body_start, body_end) = parse_changelog(text)
    if any(entry.version == version for entry in entries):
        raise ChangelogError(f"Version {version} already exists; historical entries are immutable")
    body = text[body_start:body_end].strip()
    items = [line for line in body.splitlines() if line.strip()]
    if not items or all(line.strip() in {"-", "- Aucun changement."} for line in items):
        raise ChangelogError("The 'Non publié' section has no release note to prepare")
    replacement = f"\n\n- Aucun changement pour le moment.\n\n## Version {version} ({date_value})\n\n{body}\n\n"
    path.write_text(text[:body_start] + replacement + text[body_end:], encoding="utf-8")


def marker_pair(plugin_id: str, version: str) -> tuple[str, str]:
    version = normalize_version(version)
    key = f"{plugin_id}:{version}"
    return (
        f"<!-- jeedom-changelog:{key}:start -->",
        f"<!-- jeedom-changelog:{key}:end -->",
    )


def markdown_to_html(markdown: str) -> str:
    renderer = mistune.create_markdown(escape=True)
    rendered = renderer(markdown).strip()
    rendered = re.sub(
        r"<h2>Version ([0-9.]+) \(([^<]+)\)</h2>",
        lambda match: (
            f'<h2 id="version-{html.escape(match.group(1), quote=True)}">'
            f"Version {html.escape(match.group(1))} ({html.escape(match.group(2))})</h2>"
        ),
        rendered,
        count=1,
    )
    return rendered


def detect_wordpress_format(content: str) -> str:
    if not isinstance(content, str) or not content.strip():
        raise ChangelogError("WordPress article content is empty or unavailable")
    has_gutenberg = "<!-- wp:" in content or "<!-- /wp:" in content
    has_html = bool(HTML_TAG_RE.search(content))
    has_markdown = bool(MARKDOWN_RE.search(content))
    if has_gutenberg:
        opens = len(re.findall(r"<!-- wp:[^>]+(?<!/) -->", content))
        closes = len(re.findall(r"<!-- /wp:[^>]+ -->", content))
        if opens != closes:
            raise ChangelogError("Gutenberg block comments appear unbalanced; refusing conversion")
        return "gutenberg"
    if has_html and has_markdown:
        raise ChangelogError("WordPress content mixes HTML and Markdown ambiguously")
    if has_html:
        return "html"
    if has_markdown:
        return "markdown"
    raise ChangelogError("Unable to determine whether WordPress content is HTML or Markdown")


def version_is_present(content: str, plugin_id: str, version: str) -> tuple[bool, str]:
    start, end = marker_pair(plugin_id, version)
    if content.count(start) or content.count(end):
        if content.count(start) == 1 and content.count(end) == 1 and content.index(start) < content.index(end):
            return True, "managed-marker"
        raise ChangelogError(f"Malformed or duplicate markers for version {version}")
    pattern = re.compile(
        rf"(?:Version|version)[\s\u00a0]+{re.escape(version)}(?![0-9.])",
        re.IGNORECASE,
    )
    if pattern.search(content):
        return True, "manual-entry"
    return False, "absent"


def render_entry(plugin_id: str, entry: ReleaseEntry, target_format: str) -> str:
    start, end = marker_pair(plugin_id, entry.version)
    if target_format == "markdown":
        body = entry.markdown
        return f"{start}\n{body}\n{end}"
    body = markdown_to_html(entry.markdown)
    fragment = (
        f'{start}\n<section class="jeedom-changelog-entry" '
        f'data-plugin="{html.escape(plugin_id, quote=True)}" '
        f'data-version="{html.escape(entry.version, quote=True)}">\n'
        f"{body}\n</section>\n{end}"
    )
    if target_format == "gutenberg":
        return f"<!-- wp:html -->\n{fragment}\n<!-- /wp:html -->"
    if target_format == "html":
        return fragment
    raise ChangelogError(f"Unsupported WordPress format: {target_format}")


def prepend_entry(original: str, fragment: str) -> str:
    leading_length = len(original) - len(original.lstrip())
    leading = original[:leading_length]
    remainder = original[leading_length:]
    return f"{leading}{fragment}\n\n{remainder}"


class SameHostRedirectHandler(HTTPRedirectHandler):
    def __init__(self, allowed_host: str):
        super().__init__()
        self.allowed_host = allowed_host

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        parsed = urlparse(newurl)
        if parsed.scheme.lower() != "https" or (parsed.hostname or "").lower() != self.allowed_host:
            raise ChangelogError("WordPress attempted an unsafe cross-domain redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class WordPressClient:
    def __init__(self, canonical_url: str, allowed_domain: str, username: str, password: str):
        self.canonical_url = validate_allowed_domain(canonical_url, allowed_domain)
        parsed = urlparse(self.canonical_url)
        self.host = (parsed.hostname or "").lower()
        self.base_url = f"https://{self.host}"
        if not username or not password:
            raise ChangelogError("WP_USER and WP_APP_PASSWORD are required")
        token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        self.authorization = f"Basic {token}"
        self.opener = build_opener(SameHostRedirectHandler(self.host))

    def request(
        self,
        method: str,
        url: str,
        payload: dict[str, Any] | None = None,
        conditional_headers: dict[str, str] | None = None,
    ) -> ApiResponse:
        parsed = urlparse(url)
        if parsed.scheme.lower() != "https" or (parsed.hostname or "").lower() != self.host:
            raise ChangelogError("Refusing API request outside the allowed WordPress domain")
        headers = {
            "Accept": "application/json",
            "Authorization": self.authorization,
            "User-Agent": "jeedom-changelog-sync/1.0",
        }
        if conditional_headers:
            headers.update(conditional_headers)
        raw = None
        if payload is not None:
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"
        request = Request(url, headers=headers, data=raw, method=method)
        try:
            with self.opener.open(request, timeout=25) as response:
                final_url = response.geturl()
                if (urlparse(final_url).hostname or "").lower() != self.host:
                    raise ChangelogError("WordPress returned a response from an unexpected domain")
                try:
                    data = json.load(response)
                except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                    raise ChangelogError("WordPress returned invalid JSON") from exc
                return ApiResponse(
                    data=data,
                    headers={key.lower(): value for key, value in response.headers.items()},
                    final_url=final_url,
                    status=int(response.status),
                )
        except HTTPError as exc:
            if exc.code in (409, 412):
                raise ChangelogError("WordPress rejected the update because the article changed concurrently") from exc
            raise ChangelogError(f"WordPress API returned HTTP {exc.code} for {method}") from exc
        except URLError as exc:
            raise ChangelogError("WordPress API is unavailable") from exc

    def discover_rest_bases(self) -> tuple[str, ...]:
        response = self.request("GET", f"{self.base_url}/wp-json/wp/v2/types?context=edit")
        if not isinstance(response.data, dict):
            raise ChangelogError("WordPress types response is not an object")
        bases: list[str] = []
        for value in response.data.values():
            if not isinstance(value, dict) or not value.get("viewable"):
                continue
            rest_base = value.get("rest_base")
            if isinstance(rest_base, str) and re.fullmatch(r"[a-z0-9_-]+", rest_base):
                bases.append(rest_base)
        if not bases:
            raise ChangelogError("WordPress exposes no searchable public content type")
        return tuple(dict.fromkeys(bases))

    def _post_from_response(self, item: dict[str, Any], rest_base: str, response: ApiResponse) -> WordPressPost:
        content = item.get("content")
        raw = content.get("raw") if isinstance(content, dict) else None
        if not isinstance(raw, str):
            raise ChangelogError("WordPress does not expose content.raw; edit context is required")
        try:
            post_id = int(item["id"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ChangelogError("WordPress returned an invalid post id") from exc
        protected = {
            key: item.get(key)
            for key in ("link", "slug", "status", "type", "title", "categories")
        }
        return WordPressPost(
            post_id=post_id,
            rest_base=rest_base,
            canonical_url=normalize_canonical_url(str(item.get("link", ""))),
            slug=str(item.get("slug", "")),
            status=str(item.get("status", "")),
            content_raw=raw,
            modified_gmt=str(item.get("modified_gmt", "")),
            etag=response.headers.get("etag", ""),
            last_modified=response.headers.get("last-modified", ""),
            protected=protected,
        )

    def find_post(self) -> WordPressPost:
        target = self.canonical_url
        slug = urlparse(target).path.rstrip("/").split("/")[-1]
        if not slug:
            raise ChangelogError("Cannot derive a WordPress slug from the changelog URL")
        matches: list[WordPressPost] = []
        fields = "id,link,slug,status,type,title,categories,content,modified_gmt"
        for rest_base in self.discover_rest_bases():
            query = urlencode({"slug": slug, "context": "edit", "per_page": 100, "_fields": fields})
            response = self.request("GET", f"{self.base_url}/wp-json/wp/v2/{rest_base}?{query}")
            if not isinstance(response.data, list):
                raise ChangelogError(f"WordPress {rest_base} lookup returned an invalid response")
            for item in response.data:
                if not isinstance(item, dict):
                    raise ChangelogError("WordPress lookup contains a non-object result")
                post = self._post_from_response(item, rest_base, response)
                if post.canonical_url == target:
                    matches.append(post)
        if len(matches) != 1:
            raise ChangelogError(
                f"Canonical changelog URL must resolve to exactly one editable WordPress article; found {len(matches)}"
            )
        post = matches[0]
        if post.status != "publish":
            raise ChangelogError("Refusing to update an article that is not currently published")
        return post

    def read_post(self, post: WordPressPost) -> WordPressPost:
        fields = "id,link,slug,status,type,title,categories,content,modified_gmt"
        response = self.request(
            "GET",
            f"{self.base_url}/wp-json/wp/v2/{post.rest_base}/{post.post_id}?"
            + urlencode({"context": "edit", "_fields": fields}),
        )
        if not isinstance(response.data, dict):
            raise ChangelogError("WordPress post response is not an object")
        return self._post_from_response(response.data, post.rest_base, response)

    def update_content(self, post: WordPressPost, content: str) -> WordPressPost:
        conditional: dict[str, str] = {}
        if post.etag:
            conditional["If-Match"] = post.etag
        if post.last_modified:
            conditional["If-Unmodified-Since"] = post.last_modified
        fields = "id,link,slug,status,type,title,categories,content,modified_gmt"
        response = self.request(
            "POST",
            f"{self.base_url}/wp-json/wp/v2/{post.rest_base}/{post.post_id}?"
            + urlencode({"context": "edit", "_fields": fields}),
            {"content": content},
            conditional,
        )
        if not isinstance(response.data, dict):
            raise ChangelogError("WordPress update response is not an object")
        return self._post_from_response(response.data, post.rest_base, response)


def content_fingerprint(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def ensure_unchanged(before: WordPressPost, current: WordPressPost) -> None:
    if before.post_id != current.post_id or before.protected != current.protected:
        raise ChangelogError("WordPress article identity or protected metadata changed concurrently")
    if before.modified_gmt != current.modified_gmt or before.content_raw != current.content_raw:
        raise ChangelogError("WordPress article content changed concurrently")


def write_preview(preview_dir: Path, original: str, updated: str, fragment: str, summary: dict[str, Any]) -> None:
    preview_dir.mkdir(parents=True, exist_ok=True)
    (preview_dir / "wordpress-before.txt").write_text(original, encoding="utf-8")
    (preview_dir / "wordpress-after.txt").write_text(updated, encoding="utf-8")
    (preview_dir / "changelog-entry.html").write_text(fragment + "\n", encoding="utf-8")
    diff = "".join(
        difflib.unified_diff(
            original.splitlines(keepends=True),
            updated.splitlines(keepends=True),
            fromfile="wordpress-before",
            tofile="wordpress-after",
        )
    )
    (preview_dir / "wordpress-before-after.diff").write_text(diff, encoding="utf-8")
    (preview_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def credentials_from_environment() -> tuple[str, str]:
    username = os.environ.get("WP_USER", "")
    password = os.environ.get("WP_APP_PASSWORD", "")
    if not username or not password:
        raise ChangelogError("WP_USER and WP_APP_PASSWORD must be set")
    return username, password


def connection_test(root: Path, allowed_domain: str) -> None:
    repository = load_repository(root)
    username, password = credentials_from_environment()
    client = WordPressClient(repository.changelog_url, allowed_domain, username, password)
    post = client.find_post()
    content_format = detect_wordpress_format(post.content_raw)
    print(
        "Read-only connection OK: "
        f"plugin={repository.plugin_id}, article={post.canonical_url}, format={content_format}"
    )


def sync(root: Path, allowed_domain: str, version_value: str, publish: bool, preview_dir: Path) -> None:
    repository = load_repository(root)
    entry = get_release_entry(repository, version_value)
    username, password = credentials_from_environment()
    client = WordPressClient(repository.changelog_url, allowed_domain, username, password)
    post = client.find_post()
    content_format = detect_wordpress_format(post.content_raw)
    present, presence_kind = version_is_present(
        post.content_raw, repository.plugin_id, entry.version
    )
    if present:
        print(
            f"No change: version {entry.version} is already present "
            f"({presence_kind}); duplicate publication prevented"
        )
        return

    fragment = render_entry(repository.plugin_id, entry, content_format)
    updated = prepend_entry(post.content_raw, fragment)
    summary = {
        "mode": "publish" if publish else "dry-run",
        "plugin": repository.plugin_id,
        "version": entry.version,
        "article": post.canonical_url,
        "format": content_format,
        "before_sha256": content_fingerprint(post.content_raw),
        "after_sha256": content_fingerprint(updated),
        "history_preserved": updated.endswith(post.content_raw),
    }
    write_preview(preview_dir, post.content_raw, updated, fragment, summary)
    print(
        f"Dry-run preview created in {preview_dir}: version={entry.version}, "
        f"format={content_format}, history_preserved=true"
    )
    if not publish:
        return

    current = client.read_post(post)
    ensure_unchanged(post, current)
    if not current.etag and not current.last_modified:
        raise ChangelogError(
            "WordPress supplied no ETag or Last-Modified validator; refusing a non-conditional write"
        )
    saved = client.update_content(current, updated)
    if saved.post_id != post.post_id or saved.protected != post.protected:
        raise ChangelogError("WordPress changed protected article metadata during the update")
    verified = client.read_post(saved)
    if verified.content_raw != updated:
        raise ChangelogError("WordPress write verification failed; content does not match")
    if verified.protected != post.protected:
        raise ChangelogError("WordPress write verification found modified article metadata")
    inserted, kind = version_is_present(verified.content_raw, repository.plugin_id, entry.version)
    if not inserted or kind != "managed-marker":
        raise ChangelogError("WordPress write verification cannot find the managed version marker")
    print(f"Published and verified version {entry.version} in the existing WordPress article")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="Plugin repository root")
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate", help="Validate repository metadata and changelog")
    validate_parser.add_argument("--version", help="Optional release version to cross-check")

    prepare_parser = subparsers.add_parser("prepare", help="Explicitly turn Non publié into a dated release")
    prepare_parser.add_argument("--version", required=True)
    prepare_parser.add_argument("--date", required=True, help="DD/MM/YYYY")

    connection_parser = subparsers.add_parser("connection-test", help="Read-only WordPress authentication test")
    connection_parser.add_argument("--allowed-domain", required=True)

    sync_parser = subparsers.add_parser("sync", help="Simulate or publish one release entry")
    sync_parser.add_argument("--version", required=True)
    sync_parser.add_argument("--allowed-domain", required=True)
    sync_parser.add_argument("--preview-dir", type=Path, default=ROOT / PREVIEW_DIR)
    mode = sync_parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Read and preview only (default)")
    mode.add_argument("--publish", action="store_true", help="Explicitly update WordPress")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    root = args.root.resolve()
    if args.command == "validate":
        repository = load_repository(root)
        if args.version:
            get_release_entry(repository, args.version)
        print(
            f"Changelog valid: plugin={repository.plugin_id}, "
            f"pluginVersion={repository.plugin_version}, versions={len(repository.entries)}"
        )
        return 0
    if args.command == "prepare":
        prepare_release(root, args.version, args.date)
        print(f"Prepared version {normalize_version(args.version)} in {CHANGELOG_PATH}")
        return 0
    if args.command == "connection-test":
        connection_test(root, args.allowed_domain)
        return 0
    if args.command == "sync":
        sync(root, args.allowed_domain, args.version, args.publish, args.preview_dir)
        return 0
    raise ChangelogError("Unknown command")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ChangelogError, OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
