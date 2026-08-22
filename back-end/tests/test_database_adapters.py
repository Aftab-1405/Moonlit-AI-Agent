"""Tests for the database adapter layer.

These tests cover the bank-grade security fixes:

- ``BaseDatabaseAdapter.quote_identifier`` rejects injection vectors and
  produces DBMS-specific quoted forms.
- ``BaseDatabaseAdapter.parse_connection_string`` extracts host/port/db/user.
- Each concrete adapter (MySQL, PostgreSQL, SQL Server, Oracle) sets the
  correct identifier-quote characters.
- ``DatabaseSecurity.analyze_sql_query`` rejects multi-statement input,
  DDL, DML, and accepts only read-only SELECT/WITH.
- ``DatabaseSecurity.validate_table_name`` rejects the injection vectors
  (hyphens, leading digits, all-numeric names) that the previous regex
  allowed.
"""

from __future__ import annotations

import pytest

from service.database.adapters import get_adapter
from service.database.adapters.base_adapter import BaseDatabaseAdapter
from service.database.adapters.mysql_adapter import MySQLAdapter
from service.database.adapters.postgresql_adapter import PostgreSQLAdapter
from service.database.adapters.sqlserver_adapter import SQLServerAdapter
from service.database.security import DatabaseSecurity


class TestQuoteIdentifier:
    """Tests for the centralized ``quote_identifier`` method."""

    @pytest.mark.parametrize(
        "db_type,identifier,expected",
        [
            ("mysql", "users", "`users`"),
            ("mysql", "schema.users", "`schema`.`users`"),
            ("postgresql", "users", '"users"'),
            ("postgresql", "public.users", '"public"."users"'),
            ("sqlserver", "users", "[users]"),
            ("sqlserver", "dbo.users", "[dbo].[users]"),
            ("oracle", "users", '"users"'),
        ],
    )
    def test_dbms_specific_quoting(self, db_type: str, identifier: str, expected: str) -> None:
        """Verify the parametrize table of (db_type, identifier) → quoted-form mappings."""
        adapter = get_adapter(db_type)
        assert adapter.quote_identifier(identifier) == expected

    @pytest.mark.parametrize(
        "identifier",
        [
            "1users",  # leading digit
            "user-name",  # hyphen
            "user name",  # space
            "user;DROP",  # semicolon
            "",  # empty
        ],
    )
    def test_rejects_injection_vectors(self, identifier: str) -> None:
        """Verify the parametrize table of SQL injection vectors raises ValueError."""
        adapter = get_adapter("mysql")
        with pytest.raises(ValueError):
            adapter.quote_identifier(identifier)


class TestParseConnectionString:
    """Tests for the base ``parse_connection_string`` method."""

    def test_parses_url_form(self) -> None:
        """Parse a full mysql:// URL into host/port/database/user components."""
        adapter = get_adapter("mysql")
        host, port, database, user = adapter.parse_connection_string("mysql://alice:pw@db.example.com:3306/customers")
        assert host == "db.example.com"
        assert port == 3306
        assert database == "customers"
        assert user == "alice"

    def test_parses_without_port(self) -> None:
        """Parse a URL that omits the port number."""
        adapter = get_adapter("postgresql")
        host, port, database, user = adapter.parse_connection_string("postgresql://user@host/db")
        assert host == "host"
        assert port is None
        assert database == "db"
        assert user == "user"

    def test_parses_without_database(self) -> None:
        """Parse a URL that omits the database name."""
        adapter = get_adapter("mysql")
        host, port, database, user = adapter.parse_connection_string("mysql://user:pw@host:3306")
        assert host == "host"
        assert port == 3306
        assert database is None

    def test_handles_empty(self) -> None:
        """Return a tuple of Nones for an empty connection string."""
        adapter = get_adapter("mysql")
        assert adapter.parse_connection_string("") == (None, None, None, None)

    def test_falls_back_to_regex_for_non_url(self) -> None:
        """Fall back to the regex parser for Oracle EZ-connect style strings."""
        adapter = get_adapter("oracle")
        # Oracle EZ-connect style: user/pass@host:port/db. The base
        # parser captures the credentials group as a single ``user``
        # field (it does not split user/password — that's the job of
        # dialect-specific parsers like OracleAdapter._parse_connection_string).
        host, port, database, user = adapter.parse_connection_string("user/pass@host:1521/orcl")
        assert host == "host"
        assert port == 1521
        assert database == "orcl"
        # The credentials group captures everything before ``@``.
        assert user is not None
        assert "user" in user  # may include "/pass"


class TestAdapterQuoteCharacters:
    """Verify each concrete adapter declares the correct quote characters."""

    def test_mysql_uses_backticks(self) -> None:
        """Verify MySQLAdapter uses backtick quote characters."""
        assert MySQLAdapter().IDENTIFIER_QUOTE_OPEN == "`"
        assert MySQLAdapter().IDENTIFIER_QUOTE_CLOSE == "`"

    def test_sqlserver_uses_brackets(self) -> None:
        """Verify SQLServerAdapter uses square-bracket quote characters."""
        assert SQLServerAdapter().IDENTIFIER_QUOTE_OPEN == "["
        assert SQLServerAdapter().IDENTIFIER_QUOTE_CLOSE == "]"

    def test_postgresql_uses_double_quotes(self) -> None:
        """Verify PostgreSQLAdapter uses ANSI double-quote characters."""
        assert PostgreSQLAdapter().IDENTIFIER_QUOTE_OPEN == '"'
        assert PostgreSQLAdapter().IDENTIFIER_QUOTE_CLOSE == '"'

    def test_base_default_is_double_quote(self) -> None:
        """Verify the base adapter inherits the ANSI double-quote default."""
        # Adapters that don't override inherit the ANSI default.
        assert BaseDatabaseAdapter.IDENTIFIER_QUOTE_OPEN == '"'
        assert BaseDatabaseAdapter.IDENTIFIER_QUOTE_CLOSE == '"'


class TestDatabaseSecurity:
    """Tests for the read-only query analyzer and identifier validator."""

    @pytest.mark.parametrize(
        "name",
        [
            "users",
            "Customers",
            "schema_name",
            "schema.table",
            "_private",
        ],
    )
    def test_accepts_valid_table_names(self, name: str) -> None:
        """Verify the parametrize table of valid table names is accepted unchanged."""
        assert DatabaseSecurity.validate_table_name(name) == name

    @pytest.mark.parametrize(
        "name",
        [
            "",
            "1users",
            "user-name",
            "user name",
            "user;DROP",
            "a" * 129,
        ],
    )
    def test_rejects_invalid_table_names(self, name: str) -> None:
        """Verify the parametrize table of invalid table names raises ValueError."""
        with pytest.raises(ValueError):
            DatabaseSecurity.validate_table_name(name)

    @pytest.mark.parametrize("dialect", ["mysql", "postgresql", "sqlserver", "oracle"])
    def test_analyze_accepts_simple_select(self, dialect: str) -> None:
        """Mark a simple SELECT as safe and record the accessed table."""
        result = DatabaseSecurity.analyze_sql_query("SELECT * FROM users", dialect=dialect)
        assert result["is_safe"] is True
        assert result["query_type"] == "SELECT"
        assert "users" in result["tables_accessed"]

    def test_analyze_accepts_with_cte(self) -> None:
        """Mark a WITH … SELECT query as safe with query_type WITH."""
        result = DatabaseSecurity.analyze_sql_query("WITH recent AS (SELECT * FROM logs) SELECT * FROM recent")
        assert result["is_safe"] is True
        assert result["query_type"] == "WITH"

    def test_analyze_rejects_multi_statement(self) -> None:
        """Mark a multi-statement query (semicolon followed by more SQL) as unsafe."""
        result = DatabaseSecurity.analyze_sql_query("SELECT * FROM users; DROP TABLE users")
        assert result["is_safe"] is False

    def test_analyze_rejects_insert(self) -> None:
        """Mark an INSERT statement as unsafe."""
        result = DatabaseSecurity.analyze_sql_query("INSERT INTO users (name) VALUES ('alice')")
        assert result["is_safe"] is False

    def test_analyze_rejects_update(self) -> None:
        """Mark an UPDATE statement as unsafe."""
        result = DatabaseSecurity.analyze_sql_query("UPDATE users SET name = 'alice'")
        assert result["is_safe"] is False

    def test_analyze_rejects_delete(self) -> None:
        """Mark a DELETE statement as unsafe."""
        result = DatabaseSecurity.analyze_sql_query("DELETE FROM users")
        assert result["is_safe"] is False

    def test_analyze_rejects_drop(self) -> None:
        """Mark a DROP statement as unsafe."""
        result = DatabaseSecurity.analyze_sql_query("DROP TABLE users")
        assert result["is_safe"] is False

    def test_analyze_rejects_truncate(self) -> None:
        """Mark a TRUNCATE statement as unsafe."""
        result = DatabaseSecurity.analyze_sql_query("TRUNCATE TABLE users")
        assert result["is_safe"] is False

    def test_analyze_rejects_alter(self) -> None:
        """Mark an ALTER statement as unsafe."""
        result = DatabaseSecurity.analyze_sql_query("ALTER TABLE users ADD COLUMN x INT")
        assert result["is_safe"] is False

    def test_analyze_rejects_grant(self) -> None:
        """Mark a GRANT statement as unsafe."""
        result = DatabaseSecurity.analyze_sql_query("GRANT SELECT ON users TO bob")
        assert result["is_safe"] is False

    def test_analyze_rejects_empty_query(self) -> None:
        """Raise ValueError when given an empty SQL query."""
        with pytest.raises(ValueError):
            DatabaseSecurity.analyze_sql_query("")

    def test_clear_cache_is_safe_to_call(self) -> None:
        """Verify ``clear_cache`` is safe to call with no prior cached entries."""
        # Should not raise.
        DatabaseSecurity.clear_cache()
