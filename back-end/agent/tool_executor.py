"""
ToolExecutor - Tool argument validation and result summarization.

Handles Pydantic validation of tool inputs and dual summarization
(full UI result vs. token-efficient LLM context).
"""

import json
import logging
from typing import Dict, Any

from services.tool_schemas import validate_tool_args, structure_tool_result

logger = logging.getLogger(__name__)


class ToolExecutor:
    """Tool argument validation and result processing."""

    @staticmethod
    def validate_and_parse_args(function_name: str, raw_args: Dict) -> Dict[str, Any]:
        """
        Validate and parse tool arguments using Pydantic schemas.

        Args:
            function_name: Name of the tool
            raw_args: Raw arguments dict from LLM

        Returns:
            Validated and parsed arguments dict

        Raises:
            ValueError: If validation fails
        """
        validated = validate_tool_args(function_name, raw_args or {})
        return validated.model_dump()

    @staticmethod
    def summarize_for_ui(tool_name: str, result: Dict[str, Any]) -> str:
        """
        Create a structured summary of the tool result for the UI stream.

        Includes full data for frontend rendering.
        """
        structured = structure_tool_result(tool_name, result)
        return json.dumps(structured)

    @staticmethod
    def summarize_for_llm(tool_name: str, result: Dict[str, Any]) -> str:
        """
        Create a token-efficient summary for LLM context.

        For execute_query, excludes the full 'data' field — LLM only sees 'preview'.
        This prevents token limit issues with large query results.
        """
        structured = structure_tool_result(tool_name, result)

        # Remove full data field for execute_query - LLM only needs preview.
        # Add explicit anti-hallucination guardrails because preview rows may be partial.
        if tool_name == "execute_query":
            if 'data' in structured:
                del structured['data']
            structured["llm_guardrails"] = {
                "preview_only_context": bool(structured.get("preview_is_partial", False)),
                "do_not_fabricate_unseen_rows": True,
                "when_user_requests_full_results": (
                    "Tell the user complete data is available in SQL editor results pane/canvas."
                ),
            }

        return json.dumps(structured)
