from langgraph_orchestration.tools import TOOL_REQUIRED_SKILLS
from skills.skill_registry import SkillRegistry


def test_disconnected_catalog_keeps_non_database_diagram_generation_available():
    context = SkillRegistry().build_available_skills_context(db_connected=False)

    assert "react-flow-diagram" in context
    assert "database-querying" not in context
    assert "query-history" not in context


def test_diagram_skill_authorizes_only_the_database_evidence_it_may_request():
    for tool_name in ("get_schema_overview", "get_foreign_keys", "explain_query", "get_table_row_counts"):
        assert "react-flow-diagram" in TOOL_REQUIRED_SKILLS[tool_name]
