# File: config.py
"""Application configuration settings"""

import os
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Base configuration class with common settings"""
    
    # Application Environment
    # Options: development, staging, production
    APP_ENV = os.getenv('APP_ENV', 'development')
    DEBUG = APP_ENV == 'development'
    TESTING = APP_ENV == 'testing'
    
    # Secret key - should always be set in environment
    SECRET_KEY = os.getenv('SECRET_KEY')
    if not SECRET_KEY or SECRET_KEY == 'your_secret_key_here':
        raise ValueError("SECRET_KEY environment variable must be set to a real value (not the placeholder)")
    
    # LLM API Configuration (Cerebras)
    # Multi-key support for load balancing
    _llm_keys_raw = os.getenv('LLM_API_KEYS', '')
    LLM_API_KEYS = [k.strip() for k in _llm_keys_raw.split(',') if k.strip()]
    
    # LLM Rate Limiting
    LLM_RATELIMIT_ENABLED = os.getenv('LLM_RATELIMIT_ENABLED', 'True').lower() == 'true'
    LLM_MAX_RPM_PER_KEY = int(os.getenv('LLM_MAX_RPM_PER_KEY', 25))
    LLM_MAX_CONCURRENT = int(os.getenv('LLM_MAX_CONCURRENT', 5))
    LLM_QUEUE_TIMEOUT = int(os.getenv('LLM_QUEUE_TIMEOUT', 60))
    
    # Per-User Quota (Redis-based)
    USER_QUOTA_ENABLED = os.getenv('USER_QUOTA_ENABLED', 'True').lower() == 'true'
    USER_QUOTA_PER_MINUTE = int(os.getenv('USER_QUOTA_PER_MINUTE', 4))
    USER_QUOTA_PER_HOUR = int(os.getenv('USER_QUOTA_PER_HOUR', 100))
    USER_QUOTA_PER_DAY = int(os.getenv('USER_QUOTA_PER_DAY', 500))
    
    # Firebase credentials from environment variables
    @staticmethod
    def get_firebase_credentials():
        """Get Firebase credentials from environment variables"""
        required_env_vars = [
            'FIREBASE_TYPE',
            'FIREBASE_PROJECT_ID', 
            'FIREBASE_PRIVATE_KEY_ID',
            'FIREBASE_PRIVATE_KEY',
            'FIREBASE_CLIENT_EMAIL',
            'FIREBASE_CLIENT_ID',
            'FIREBASE_AUTH_URI',
            'FIREBASE_TOKEN_URI'
        ]
        
        # Check if all required environment variables are present
        missing_vars = [var for var in required_env_vars if not os.getenv(var)]
        if missing_vars:
            raise ValueError(f"Missing Firebase environment variables: {', '.join(missing_vars)}")
        
        # Process the private key to handle newlines correctly
        private_key = os.getenv('FIREBASE_PRIVATE_KEY')
        if private_key:
            # Replace literal \n with actual newlines
            private_key = private_key.replace('\\n', '\n')
        
        return {
            "type": os.getenv('FIREBASE_TYPE'),
            "project_id": os.getenv('FIREBASE_PROJECT_ID'),
            "private_key_id": os.getenv('FIREBASE_PRIVATE_KEY_ID'),
            "private_key": private_key,
            "client_email": os.getenv('FIREBASE_CLIENT_EMAIL'),
            "client_id": os.getenv('FIREBASE_CLIENT_ID'),
            "auth_uri": os.getenv('FIREBASE_AUTH_URI'),
            "token_uri": os.getenv('FIREBASE_TOKEN_URI')
        }
    
    # Validation method to check Firebase credentials at startup
    @staticmethod
    def validate_firebase_credentials():
        """Validate Firebase credentials are properly configured"""
        logger = logging.getLogger(__name__)
        try:
            credentials = Config.get_firebase_credentials()
            
            # Basic validation
            if not credentials['project_id']:
                raise ValueError("Firebase project_id is empty")
            
            if not credentials['private_key'].startswith('-----BEGIN PRIVATE KEY-----'):
                raise ValueError("Firebase private_key format is invalid")
                
            if '@' not in credentials['client_email']:
                raise ValueError("Firebase client_email format is invalid")
                
            logger.info("✅ Firebase credentials validation passed")
            return True
            
        except Exception as e:
            logger.error(f"❌ Firebase credentials validation failed: {e}")
            return False
    
    # Thread Pool Configuration
    MAX_WORKERS = int(os.getenv('MAX_WORKERS', 32))
    
    # Logging Configuration (base default)
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

    # Firebase Web/Client SDK Configuration (for frontend)
    @staticmethod
    def get_firebase_web_config():
        """Get Firebase web client configuration from environment variables"""
        return {
            "apiKey": os.getenv('FIREBASE_WEB_API_KEY', ''),
            "authDomain": os.getenv('FIREBASE_AUTH_DOMAIN', ''),
            "projectId": os.getenv('FIREBASE_WEB_PROJECT_ID', ''),
            "storageBucket": os.getenv('FIREBASE_STORAGE_BUCKET', ''),
            "messagingSenderId": os.getenv('FIREBASE_MESSAGING_SENDER_ID', ''),
            "appId": os.getenv('FIREBASE_APP_ID', '')
        }

    # Validation method to ensure Firebase project consistency
    @staticmethod
    def validate_firebase_project_consistency():
        """Validate that Admin SDK and Client SDK use the same Firebase project"""
        logger = logging.getLogger(__name__)
        admin_project_id = os.getenv('FIREBASE_PROJECT_ID', '')
        web_project_id = os.getenv('FIREBASE_WEB_PROJECT_ID', '')

        if not admin_project_id or not web_project_id:
            logger.warning("⚠️  Warning: Firebase project IDs not configured")
            return False

        if admin_project_id != web_project_id:
            raise ValueError(
                f"Firebase project ID mismatch!\n"
                f"  Admin SDK (FIREBASE_PROJECT_ID): {admin_project_id}\n"
                f"  Client SDK (FIREBASE_WEB_PROJECT_ID): {web_project_id}\n"
                f"Both must use the SAME Firebase project for authentication to work correctly."
            )

        logger.info(f"✅ Firebase project consistency validated: {admin_project_id}")
        return True

    # CORS Configuration
    _cors_origins_raw = os.getenv('CORS_ORIGINS')
    CORS_ORIGINS = _cors_origins_raw.split(',') if _cors_origins_raw else None

    # Rate Limiting Configuration
    RATELIMIT_ENABLED = os.getenv('RATELIMIT_ENABLED', 'True').lower() == 'true'
    RATELIMIT_STORAGE_URL = os.getenv('RATELIMIT_STORAGE_URL', 'memory://')
    RATELIMIT_DEFAULT = os.getenv('RATELIMIT_DEFAULT', '200 per day, 50 per hour')

    # SQL Query Security Configuration
    MAX_QUERY_RESULTS = int(os.getenv('MAX_QUERY_RESULTS', 10000))  # Max rows to return
    QUERY_TIMEOUT_SECONDS = int(os.getenv('QUERY_TIMEOUT_SECONDS', 30))  # Query timeout
    MAX_QUERY_LENGTH = int(os.getenv('MAX_QUERY_LENGTH', 10000))  # Max characters in query
    
    # AI Context Configuration (Firestore-based schema context for AI agent)
    SCHEMA_CONTEXT_TTL_SECONDS = int(os.getenv('SCHEMA_CONTEXT_TTL_SECONDS', 300))  # 5 min TTL
    SCHEMA_CONTEXT_MAX_TABLES = int(os.getenv('SCHEMA_CONTEXT_MAX_TABLES', 20))  # Max tables to store
    CONNECTION_CONTEXT_TTL_SECONDS = int(os.getenv('CONNECTION_CONTEXT_TTL_SECONDS', 300))  # 5 min
    CONTEXT_METRICS_ENABLED = os.getenv('CONTEXT_METRICS_ENABLED', 'True').lower() == 'true'
    
    # Session/Cookie Configuration (base defaults)
    SESSION_COOKIE_SECURE = False  # Override in production
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'lax'
    SESSION_EXPIRE_SECONDS = int(os.getenv('SESSION_EXPIRE_SECONDS', 86400))  # 24 hours


class DevelopmentConfig(Config):
    """Development-specific configuration
    
    Optimized for local development with:
    - Debug mode enabled for detailed error pages
    - Verbose logging for troubleshooting
    - Relaxed security for localhost testing
    - CORS allows localhost origins
    """
    DEBUG = True
    TESTING = False
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'DEBUG')
    
    # Development-friendly settings
    SESSION_COOKIE_SECURE = False  # Allow HTTP for localhost
    SESSION_COOKIE_SAMESITE = 'lax'
    
    # Relaxed rate limits for testing
    RATELIMIT_DEFAULT = os.getenv('RATELIMIT_DEFAULT', '1000 per day, 200 per hour')
    
    # Disable LLM rate limiting for fast local dev
    LLM_RATELIMIT_ENABLED = False
    USER_QUOTA_ENABLED = False


class StagingConfig(Config):
    """Staging-specific configuration
    
    Mirrors production but with:
    - INFO logging for debugging deployed issues
    - Same security settings as production
    - Can connect to staging database
    """
    DEBUG = False
    TESTING = False
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    
    # Production-like security
    SESSION_COOKIE_SECURE = True  # Require HTTPS
    SESSION_COOKIE_SAMESITE = 'strict'
    
    # Slightly relaxed rate limits for QA testing
    RATELIMIT_DEFAULT = os.getenv('RATELIMIT_DEFAULT', '500 per day, 100 per hour')
    
    # Conservative LLM limits for staging
    LLM_MAX_RPM_PER_KEY = 20
    LLM_MAX_CONCURRENT = 3
    
    # Shorter session for staging tests
    SESSION_EXPIRE_SECONDS = int(os.getenv('SESSION_EXPIRE_SECONDS', 43200))  # 12 hours


class ProductionConfig(Config):
    """Production-specific configuration
    
    Maximum security with:
    - No debug information exposed
    - Minimal logging (only warnings+)
    - Strict cookie security
    - Mandatory CORS restriction
    - Strong secret key validation
    """
    DEBUG = False
    TESTING = False
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'WARNING')
    
    # Strict security settings
    SESSION_COOKIE_SECURE = True  # HTTPS only
    SESSION_COOKIE_HTTPONLY = True  # No JS access
    SESSION_COOKIE_SAMESITE = 'strict'  # Strict same-site policy
    
    # Production rate limiting
    RATELIMIT_ENABLED = True
    RATELIMIT_DEFAULT = os.getenv('RATELIMIT_DEFAULT', '200 per day, 50 per hour')
    
    # Production LLM rate limiting
    LLM_RATELIMIT_ENABLED = True
    LLM_MAX_RPM_PER_KEY = 25
    LLM_MAX_CONCURRENT = 5
    LLM_QUEUE_TIMEOUT = 45
    
    # Tighter query limits for production
    MAX_QUERY_RESULTS = int(os.getenv('MAX_QUERY_RESULTS', 5000))
    QUERY_TIMEOUT_SECONDS = int(os.getenv('QUERY_TIMEOUT_SECONDS', 15))
    
    @classmethod
    def validate_production_settings(cls):
        """Validate production security requirements"""
        logger = logging.getLogger(__name__)
        
        # Secret key strength
        secret_key = os.getenv('SECRET_KEY', '')
        if len(secret_key) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters for production")
        
        # CORS must be explicitly set (no wildcards)
        if not cls.CORS_ORIGINS:
            raise ValueError("CORS_ORIGINS must be explicitly set in production")
        if '*' in str(cls.CORS_ORIGINS):
            raise ValueError("CORS_ORIGINS cannot contain '*' in production")
        
        # Verify HTTPS-only cookie
        if not cls.SESSION_COOKIE_SECURE:
            logger.warning("⚠️ SESSION_COOKIE_SECURE is False in production!")
        
        logger.info("✅ Production settings validated")
        return True


class TestingConfig(Config):
    """Testing-specific configuration
    
    Optimized for automated tests with:
    - Fast timeouts for quick test runs
    - Debug enabled for test failures
    - Relaxed security for test frameworks
    - Lower limits for predictable tests
    """
    DEBUG = True
    TESTING = True
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'DEBUG')
    
    # Test-friendly settings
    SESSION_COOKIE_SECURE = False  # Tests often run without HTTPS
    SESSION_EXPIRE_SECONDS = 3600  # 1 hour - short for tests
    
    # Fast timeouts for test speed
    QUERY_TIMEOUT_SECONDS = 5
    MAX_QUERY_RESULTS = 100  # Small result sets for tests
    
    # Disable rate limiting in tests
    RATELIMIT_ENABLED = False
    LLM_RATELIMIT_ENABLED = False
    USER_QUOTA_ENABLED = False


# Configuration selection based on environment
config = {
    'development': DevelopmentConfig,
    'staging': StagingConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}


def get_config():
    """Get the appropriate configuration class based on APP_ENV"""
    env = os.getenv('APP_ENV', 'development')
    return config.get(env, config['default'])