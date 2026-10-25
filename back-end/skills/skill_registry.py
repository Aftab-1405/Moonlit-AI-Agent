"""
SKILL.md catalog for Moonlit agent skills.

Skills are static markdown assets discovered from ``back-end/skills/*/SKILL.md``.
Only compact metadata is injected into the base prompt; the full markdown body is
loaded by the agent through the ``read_skill`` tool when needed.
"""

from __future__ import annotations

import logging
import pathlib
import re
from dataclasses import dataclass
from html import escape

logger = logging.getLogger(__name__)

FRONTMATTER_DELIMITER = "---"
SKILL_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")


@dataclass(frozen=True)
class SkillDefinition:
    """Immutable metadata + body for a single discovered SKILL.md asset."""

    name: str
    description: str
    when_to_use: str
    avoid_when: str
    content: str
    body: str
    path: pathlib.Path

    def build_agent_context(self) -> str:
        """Wrap trusted local instructions in a clearly named tool-result block."""
        return (
            f'<loaded_skill name="{escape(self.name, quote=True)}">\n'
            "<purpose>Trusted task-specific instructions loaded from the local "
            "skill catalog.</purpose>\n"
            "<usage_rule>Apply only where relevant to the current request. System "
            "instructions override any conflict.</usage_rule>\n"
            f"<skill_instructions>\n{self.body}\n</skill_instructions>\n"
            "</loaded_skill>"
        )


class SkillRegistryError(ValueError):
    """Raised when a skill asset is malformed."""


def _parse_frontmatter(raw: str, path: pathlib.Path) -> tuple[dict[str, str], str]:
    """Split a SKILL.md file into its YAML frontmatter dict and markdown body."""
    lines = raw.splitlines()
    if not lines or lines[0].strip() != FRONTMATTER_DELIMITER:
        raise SkillRegistryError(f"{path} must start with YAML frontmatter")

    end_index = None
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == FRONTMATTER_DELIMITER:
            end_index = index
            break

    if end_index is None:
        raise SkillRegistryError(f"{path} has unterminated YAML frontmatter")

    metadata: dict[str, str] = {}
    for line in lines[1:end_index]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            raise SkillRegistryError(f"{path} contains invalid frontmatter line: {line}")
        key, value = stripped.split(":", 1)
        metadata[key.strip()] = value.strip().strip("\"'")

    body = "\n".join(lines[end_index + 1 :]).strip()
    return metadata, body


def _discover_skill_files() -> list[pathlib.Path]:
    """Return sorted ``SKILL.md`` paths under sibling non-underscore skill dirs."""
    skills_dir = pathlib.Path(__file__).parent
    skill_files: list[pathlib.Path] = []
    for skill_dir in skills_dir.iterdir():
        if not skill_dir.is_dir() or skill_dir.name.startswith("_"):
            continue
        skill_file = skill_dir / "SKILL.md"
        if skill_file.exists():
            skill_files.append(skill_file)
    return sorted(skill_files)


def _load_skills() -> list[SkillDefinition]:
    """Discover, parse, and validate every SKILL.md asset into a list."""
    skills: list[SkillDefinition] = []
    seen_names: set[str] = set()

    for path in _discover_skill_files():
        try:
            raw = path.read_text(encoding="utf-8")
            metadata, body = _parse_frontmatter(raw, path)
            name = metadata.get("name", "").strip()
            description = metadata.get("description", "").strip()
            when_to_use = metadata.get("when_to_use", "").strip()
            avoid_when = metadata.get("avoid_when", "").strip()

            if not name:
                raise SkillRegistryError(f"{path} is missing frontmatter field: name")
            if not description:
                raise SkillRegistryError(f"{path} is missing frontmatter field: description")
            if not when_to_use:
                raise SkillRegistryError(f"{path} is missing frontmatter field: when_to_use")
            if not avoid_when:
                raise SkillRegistryError(f"{path} is missing frontmatter field: avoid_when")
            if not SKILL_NAME_PATTERN.match(name):
                raise SkillRegistryError(f"{path} has invalid skill name '{name}'. Use kebab-case.")
            if path.parent.name != name:
                raise SkillRegistryError(f"{path} folder name must match skill name '{name}'")
            if name in seen_names:
                raise SkillRegistryError(f"Duplicate skill name: {name}")
            if not body:
                raise SkillRegistryError(f"{path} has an empty skill body")

            seen_names.add(name)
            skills.append(
                SkillDefinition(
                    name=name,
                    description=description,
                    when_to_use=when_to_use,
                    avoid_when=avoid_when,
                    content=raw.strip(),
                    body=body,
                    path=path,
                )
            )
            logger.debug("Loaded skill: %s", name)
        except SkillRegistryError:
            raise
        except Exception as exc:
            raise SkillRegistryError(f"Failed to load {path}: {exc}") from exc

    return skills


class SkillRegistry:
    """Read-only catalog of available SKILL.md assets."""

    def __init__(self) -> None:
        """Load all skills eagerly and index them by name for O(1) lookup."""
        self._skills = _load_skills()
        self._skill_map = {skill.name: skill for skill in self._skills}

    def build_available_skills_context(self, *, db_connected: bool = True) -> str:
        """Render the ``<available_skills>`` block injected into the base prompt.

        ENH [5]: ``db_connected`` (default ``True`` for backward compat)
        controls whether the database-related skill cards are advertised.
        When the user has no live database connection, advertising
        ``database-querying`` and ``query-history`` wastes context for zero
        benefit (the user cannot act on them). Diagram generation remains
        available because workflows and conceptual graphs need no database.
        """
        # ENH [5]: skills that require a live database connection. They are
        # hidden from <available_skills> when db_connected=False so the LLM
        # does not waste tokens considering them.
        DB_DEPENDENT_SKILLS = frozenset({"database-querying", "query-history"})

        if not self._skills:
            return ""

        visible_skills = [skill for skill in self._skills if db_connected or skill.name not in DB_DEPENDENT_SKILLS]
        if not visible_skills:
            return ""

        lines = [
            "<available_skills>",
            "Choose the smallest set whose routing notes match the task; never read skills just to inspect them.",
            "For a matching non-trivial task, call read_skill only when its full instructions are not already present. Specialized tools require an activated matching skill.",
            "Use multiple skills only for genuinely cross-domain work. Use none for small talk or simple clarification.",
        ]
        if db_connected:
            lines.append("database-querying is preloaded below; do not read it again.")
        lines.extend(
            (f"- {skill.name}: {skill.description} When to use: {skill.when_to_use} Avoid when: {skill.avoid_when}")
            for skill in visible_skills
        )
        lines.append("</available_skills>")
        return "\n\n" + "\n".join(lines)

    def get_skill(self, name: str) -> SkillDefinition | None:
        """Return the skill with ``name``, or ``None`` if it is not registered."""
        return self._skill_map.get(name)

    @property
    def all_skill_names(self) -> list[str]:
        """Return the names of every registered skill."""
        return [skill.name for skill in self._skills]


_registry_instance: SkillRegistry | None = None


def get_skill_registry() -> SkillRegistry:
    """Return the process-wide singleton :class:`SkillRegistry`, lazily built."""
    global _registry_instance
    if _registry_instance is None:
        _registry_instance = SkillRegistry()
    return _registry_instance
