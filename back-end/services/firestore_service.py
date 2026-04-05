# File: services/firestore_service.py
"""Firestore service for conversation storage"""

import firebase_admin
from firebase_admin import credentials, firestore
from functools import lru_cache
from config import Config
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


def _initialize_firebase():
    """Initialize Firebase Admin SDK if not already initialized."""
    if not firebase_admin._apps:
        try:
            # Validate credentials first
            if not Config.validate_firebase_credentials():
                raise ValueError("Firebase credentials validation failed")
            
            # Get credentials from environment variables
            firebase_credentials = Config.get_firebase_credentials()
            cred = credentials.Certificate(firebase_credentials)
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialized successfully")
            
            # Log project info for verification
            logger.info(f"Connected to Firebase project: {firebase_credentials['project_id']}")
            
        except Exception as e:
            logger.error(f"Failed to initialize Firebase Admin SDK: {e}")
            raise


@lru_cache(maxsize=1)
def get_firestore_db():
    """
    Get Firestore database instance.
    
    Uses @lru_cache for lazy initialization and singleton behavior.
    For testing, call get_firestore_db.cache_clear() to reset.
    """
    _initialize_firebase()
    return firestore.client()


def store_conversation(conversation_id, sender, message, user_id, tools=None):
    """Store conversation message in Firestore
    
    Args:
        conversation_id: The conversation ID
        sender: 'user' or 'ai'
        message: The message content
        user_id: The user ID
        tools: Optional list of tools used (for AI messages)
    """
    try:
        db = get_firestore_db()
        conversation_ref = db.collection('conversations').document(conversation_id)

        if not conversation_ref.get().exists:
            conversation_ref.set({
                'user_id': user_id,
                'timestamp': datetime.now(),
                'messages': []
            })

        content = str(message or "").strip()

        message_data = {
            'sender': sender,
            'content': content,
            'timestamp': datetime.now()
        }
        
        # Add tools info if provided (for AI messages)
        if tools:
            message_data['tools'] = tools

        conversation_ref.update({
            'messages': firestore.ArrayUnion([message_data])
        })
        logger.debug(f"Conversation {conversation_id} updated successfully")
    except Exception as e:
        logger.error(f"Error storing conversation: {e}")
        raise


def get_conversations(user_id):
    """Get all conversations for a user"""
    try:
        db = get_firestore_db()
        from google.cloud.firestore_v1 import FieldFilter
        conversations = (
            db.collection('conversations')
            .where(filter=FieldFilter('user_id', '==', user_id))
            .get()
        )
        conversation_list = []
        for conv in conversations:
            conv_data = conv.to_dict()
            if conv_data.get('messages'):
                conversation_list.append({
                    'id': conv.id,
                    'timestamp': conv_data['timestamp'],
                    'title': conv_data['messages'][0]['content'][:40] + ('...' if len(conv_data['messages'][0]['content']) > 40 else ''),
                    'preview': conv_data['messages'][0]['content'][:50] + '...'
                })
        # Sort by timestamp descending (newest first)
        conversation_list.sort(key=lambda x: x['timestamp'], reverse=True)
        return conversation_list
    except Exception as e:
        logger.error(f"Error retrieving conversations: {e}")
        raise


def get_conversation(conversation_id):
    """Get specific conversation by ID"""
    try:
        db = get_firestore_db()
        conversation = db.collection('conversations').document(conversation_id).get()
        if conversation.exists:
            return conversation.to_dict()
        return None
    except Exception as e:
        logger.error(f"Error retrieving conversation {conversation_id}: {e}")
        raise


def delete_conversation(conversation_id, user_id):
    """Delete a conversation by ID and ensure user owns it"""
    try:
        db = get_firestore_db()

        # Get conversation reference
        conversation_ref = db.collection('conversations').document(conversation_id)
        conversation = conversation_ref.get()

        # Check if conversation exists and belongs to user
        if conversation.exists:
            conv_data = conversation.to_dict()
            if conv_data['user_id'] == user_id:
                conversation_ref.delete()
                logger.info(f"Conversation {conversation_id} deleted successfully")
                return True
            else:
                raise PermissionError("User does not own this conversation")
        else:
            raise ValueError("Conversation not found")
    except Exception as e:
        logger.error(f"Error deleting conversation {conversation_id}: {e}")
        raise


# Backward compatibility - keeping FirestoreService for existing imports
class FirestoreService:
    """
    DEPRECATED: Use module-level functions instead.
    Kept for backward compatibility with existing imports.
    
    Migration:
        FirestoreService.get_db() -> get_firestore_db()
        FirestoreService.store_conversation(...) -> store_conversation(...)
    """
    
    @classmethod
    def initialize(cls):
        """DEPRECATED: Use get_firestore_db() which auto-initializes."""
        _initialize_firebase()
    
    @classmethod
    def get_db(cls):
        """DEPRECATED: Use get_firestore_db() instead."""
        return get_firestore_db()
    
    @staticmethod
    def store_conversation(conversation_id, sender, message, user_id, tools=None):
        """DEPRECATED: Use store_conversation() module function."""
        return store_conversation(conversation_id, sender, message, user_id, tools)
    
    @staticmethod
    def get_conversations(user_id):
        """DEPRECATED: Use get_conversations() module function."""
        return get_conversations(user_id)
    
    @staticmethod
    def get_conversation(conversation_id):
        """DEPRECATED: Use get_conversation() module function."""
        return get_conversation(conversation_id)
    
    @staticmethod
    def delete_conversation(conversation_id, user_id):
        """DEPRECATED: Use delete_conversation() module function."""
        return delete_conversation(conversation_id, user_id)