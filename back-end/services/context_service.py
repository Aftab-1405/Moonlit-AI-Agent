"""
Context Service - Pure FastAPI Version

Manages persistent AI context in Firestore.
Provides schema context, connection state, and query history.
No Flask dependencies - context validation is done by caller.
"""

import hashlib
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

from config import get_config

logger = logging.getLogger(__name__)

# Get configuration
_config = get_config()


class ContextMetrics:
    """Tracks context hit/miss metrics for monitoring effectiveness."""
    
    _hits = 0
    _misses = 0
    _stores = 0
    _clears = 0
    
    @classmethod
    def record_hit(cls):
        """Record a context hit (data found and fresh)."""
        if _config.CONTEXT_METRICS_ENABLED:
            cls._hits += 1
    
    @classmethod
    def record_miss(cls):
        """Record a context miss (data not found or stale)."""
        if _config.CONTEXT_METRICS_ENABLED:
            cls._misses += 1
    
    @classmethod
    def record_store(cls):
        """Record a context store operation."""
        if _config.CONTEXT_METRICS_ENABLED:
            cls._stores += 1
    
    @classmethod
    def record_clear(cls):
        """Record a context clear operation."""
        if _config.CONTEXT_METRICS_ENABLED:
            cls._clears += 1
    
    @classmethod
    def get_stats(cls) -> Dict:
        """Get current metrics statistics."""
        total = cls._hits + cls._misses
        hit_rate = (cls._hits / total * 100) if total > 0 else 0.0
        return {
            'hits': cls._hits,
            'misses': cls._misses,
            'stores': cls._stores,
            'clears': cls._clears,
            'total_lookups': total,
            'hit_rate_percent': round(hit_rate, 2),
            'metrics_enabled': _config.CONTEXT_METRICS_ENABLED
        }
    
    @classmethod
    def reset(cls):
        """Reset all metrics (useful for testing)."""
        cls._hits = 0
        cls._misses = 0
        cls._stores = 0
        cls._clears = 0


class ContextService:
    """
    Manages AI context in Firestore.
    
    Firestore Structure:
        user_context/{user_id}
            ├── current_connection
            ├── database_schemas
            └── recent_queries
    """
    
    COLLECTION_NAME = 'user_context'
    MAX_RECENT_QUERIES = 10
    
    # =========================================================================
    # Firestore Access (delegated to repository)
    # =========================================================================
    
    @staticmethod
    def _normalize_user_id(user_id) -> str:
        """Normalize user_id to string for Firestore document ID."""
        from repositories import ContextRepository
        return ContextRepository._normalize_user_id(user_id)
    
    @staticmethod
    def _get_context_ref(user_id):
        """Get Firestore document reference for user context."""
        from repositories import ContextRepository
        return ContextRepository.get_ref(user_id)
    
    @staticmethod
    def _get_context(user_id: str) -> Dict:
        """Get full context document, or empty dict if not exists."""
        from repositories import ContextRepository
        return ContextRepository.get(user_id)
    
    @staticmethod
    def _update_context(user_id: str, data: Dict) -> bool:
        """Update context document with merge."""
        from repositories import ContextRepository
        return ContextRepository.update(user_id, data)
    
    # =========================================================================
    # Connection State Management
    # =========================================================================
    
    @staticmethod
    def set_connection(user_id: str, db_type: str, database: str, 
                       host: str, is_remote: bool, schema: str = 'public') -> bool:
        """
        Set current connection state.
        
        Args:
            user_id: User ID
            db_type: 'mysql', 'postgresql', 'sqlite'
            database: Database name
            host: Host address
            is_remote: Whether it's a remote connection
            schema: PostgreSQL schema (default 'public')
        """
        connection_data = {
            'current_connection': {
                'connected': True,
                'db_type': db_type,
                'database': database,
                'host': host,
                'is_remote': is_remote,
                'schema': schema,
                'connected_at': datetime.now().isoformat()
            }
        }
        logger.info(f"Setting connection context for user {user_id}: {db_type}/{database}")
        return ContextService._update_context(user_id, connection_data)
    
    @staticmethod
    def clear_connection(user_id: str) -> bool:
        """Clear current connection state (user disconnected)."""
        connection_data = {
            'current_connection': {
                'connected': False,
                'db_type': None,
                'database': None,
                'host': None,
                'is_remote': False,
                'schema': None,
                'disconnected_at': datetime.now().isoformat()
            }
        }
        logger.info(f"Clearing connection context for user {user_id}")
        return ContextService._update_context(user_id, connection_data)
    
    @staticmethod
    def get_connection(user_id: str) -> Dict:
        """
        Get current connection state from Firestore.
        
        Note: In FastAPI, session validation is handled by the caller
        via Redis session. This method just returns Firestore data.
        
        Args:
            user_id: The user ID to check connection for
            
        Returns:
            Dict with connection state
        """
        context = ContextService._get_context(user_id)
        return context.get('current_connection', {'connected': False})
    
    @staticmethod
    def update_schema(user_id: str, schema_name: str) -> bool:
        """Update current schema (PostgreSQL)."""
        context = ContextService._get_context(user_id)
        connection = context.get('current_connection', {})
        connection['schema'] = schema_name
        return ContextService._update_context(user_id, {'current_connection': connection})
    
    # =========================================================================
    # Schema Caching
    # =========================================================================
    
    @staticmethod
    def compute_schema_hash(tables: List[str], columns: Dict[str, List]) -> str:
        """Compute hash of schema for change detection."""
        def normalize_columns(col_list):
            """Normalize column list for consistent hashing."""
            if not col_list:
                return []
            # Check if columns are dicts (new format) or strings (old format)
            if isinstance(col_list[0], dict):
                # Sort by column name for consistency
                return sorted([c.get('name', '') for c in col_list])
            else:
                # Old string format
                return sorted(col_list)
        
        schema_str = json.dumps({
            'tables': sorted(tables),
            'columns': {k: normalize_columns(v) for k, v in sorted(columns.items())}
        }, sort_keys=True)
        return hashlib.md5(schema_str.encode()).hexdigest()
    
    @staticmethod
    def get_schema_context(user_id: str, database: str) -> Optional[Dict]:
        """
        Get stored schema context for a database with TTL check.
        
        This is AI context (not cache) - stores database structure
        so the AI agent understands the schema it's working with.
        
        Returns None if context is stale or doesn't exist.
        """
        context = ContextService._get_context(user_id)
        schemas = context.get('database_schemas', {})
        cached = schemas.get(database)
        
        if not cached:
            ContextMetrics.record_miss()
            return None
        
        # Check TTL using config value
        cached_at = cached.get('cached_at')
        if cached_at:
            try:
                # Handle both ISO string and Firestore Timestamp objects
                if hasattr(cached_at, 'isoformat'):
                    # It's a datetime or Firestore Timestamp - convert to datetime
                    if hasattr(cached_at, 'timestamp'):
                        # Firestore Timestamp has .timestamp() method
                        from datetime import timezone
                        cache_time = datetime.fromtimestamp(cached_at.timestamp())
                    else:
                        # Regular datetime object
                        cache_time = cached_at
                else:
                    # It's a string - parse as ISO format
                    cache_time = datetime.fromisoformat(str(cached_at).replace('Z', '+00:00'))
                
                if cache_time.tzinfo:
                    cache_time = cache_time.replace(tzinfo=None)
                age_seconds = (datetime.now() - cache_time).total_seconds()
                
                ttl = _config.SCHEMA_CONTEXT_TTL_SECONDS
                if age_seconds > ttl:
                    logger.debug(f"Schema context stale for {database} (age: {age_seconds:.0f}s, TTL: {ttl}s), will refresh")
                    ContextMetrics.record_miss()
                    return None
            except (ValueError, TypeError, AttributeError) as e:
                logger.warning(f"Could not parse cached_at timestamp: {e}")
                ContextMetrics.record_miss()
                return None
        
        ContextMetrics.record_hit()
        return cached
    
    @staticmethod
    def store_schema_context(user_id: str, database: str, tables: List[str], 
                             columns: Dict[str, List]) -> bool:
        """Store database schema as AI context.
        
        This provides the AI agent with understanding of the database
        structure (tables, columns) it's working with.
        """
        schema_data = {
            'tables': tables,
            'columns': columns,
            'schema_hash': ContextService.compute_schema_hash(tables, columns),
            'cached_at': datetime.now().isoformat()
        }
        
        context = ContextService._get_context(user_id)
        schemas = context.get('database_schemas', {})
        schemas[database] = schema_data
        
        ContextMetrics.record_store()
        logger.info(f"Stored schema context for user {user_id}, database {database}: {len(tables)} tables")
        return ContextService._update_context(user_id, {'database_schemas': schemas})
    
    @staticmethod
    def is_schema_changed(user_id: str, database: str, 
                          current_tables: List[str], current_columns: Dict) -> bool:
        """Check if schema has changed since last context update."""
        cached = ContextService.get_schema_context(user_id, database)
        if not cached:
            return True
        
        current_hash = ContextService.compute_schema_hash(current_tables, current_columns)
        return cached.get('schema_hash') != current_hash
    
    @staticmethod
    def clear_schema_context(user_id: str, database: str) -> bool:
        """Clear schema context for a database (forces refresh on next access)."""
        from repositories import ContextRepository
        
        success = ContextRepository.delete_field(user_id, f'database_schemas.{database}')
        if success:
            ContextMetrics.record_clear()
            logger.info(f"Cleared schema context for {database}")
        return success
    
    @staticmethod
    def get_schema_summary(user_id: str) -> List[Dict]:
        """Get summary of stored schema contexts for UI display."""
        context = ContextService._get_context(user_id)
        schemas = context.get('database_schemas', {})
        
        summary = []
        for db_name, schema_data in schemas.items():
            summary.append({
                'database': db_name,
                'table_count': len(schema_data.get('tables', [])),
                'cached_at': schema_data.get('cached_at')
            })
        
        summary.sort(key=lambda x: x.get('cached_at') or '', reverse=True)
        return summary
    
    @staticmethod
    def get_all_schema_contexts(user_id: str) -> Dict:
        """Get all stored schema contexts for user."""
        context = ContextService._get_context(user_id)
        return context.get('database_schemas', {})
    
    # =========================================================================
    # Query History
    # =========================================================================
    
    @staticmethod
    def add_query(user_id: str, query: str, database: str, 
                  row_count: int = 0, status: str = 'success') -> bool:
        """Add a query to recent history."""
        query_entry = {
            'query': query[:500],  # Truncate long queries
            'database': database,
            'row_count': row_count,
            'status': status,
            'executed_at': datetime.now().isoformat()
        }
        
        context = ContextService._get_context(user_id)
        queries = context.get('recent_queries', [])
        queries.append(query_entry)
        queries = queries[-ContextService.MAX_RECENT_QUERIES:]
        
        return ContextService._update_context(user_id, {'recent_queries': queries})
    
    @staticmethod
    def get_recent_queries(user_id: str, limit: int = 10) -> List[Dict]:
        """Get recent queries for user."""
        context = ContextService._get_context(user_id)
        queries = context.get('recent_queries', [])
        return queries[-limit:]
    
    @staticmethod
    def clear_query_history(user_id: str) -> bool:
        """Clear query history."""
        return ContextService._update_context(user_id, {'recent_queries': []})
    
    # =========================================================================
    # Full Context for AI
    # =========================================================================
    
    @staticmethod
    def get_full_context(user_id: str) -> Dict:
        """Get complete context for AI tools."""
        context = ContextService._get_context(user_id)
        
        return {
            'connection': context.get('current_connection', {'connected': False}),
            'schemas': context.get('database_schemas', {}),
            'recent_queries': context.get('recent_queries', []),
            'updated_at': context.get('updated_at')
        }
    
    @staticmethod
    def clear_all_context(user_id: str) -> bool:
        """Clear all context for user."""
        from repositories import ContextRepository
        return ContextRepository.delete(user_id)
    
    # =========================================================================
    # User Preferences
    # =========================================================================
    
    @staticmethod
    def set_user_preference(user_id: str, key: str, value: Any) -> bool:
        """Set a user preference."""
        try:
            return ContextService._update_context(user_id, {
                f'preferences.{key}': value
            })
        except Exception as e:
            logger.error(f"Error setting preference {key} for user {user_id}: {e}")
            return False
    
    @staticmethod
    def get_user_preference(user_id: str, key: str, default: Any = None) -> Any:
        """Get a single user preference."""
        context = ContextService._get_context(user_id)
        preferences = context.get('preferences', {})
        return preferences.get(key, default)
    
    @staticmethod
    def get_user_preferences(user_id: str) -> Dict:
        """Get all user preferences."""
        context = ContextService._get_context(user_id)
        return context.get('preferences', {})
