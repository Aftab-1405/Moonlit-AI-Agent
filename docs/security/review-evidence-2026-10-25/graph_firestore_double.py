"""Minimal document/transaction command double; no network or credentials."""
import copy
from datetime import datetime, timezone
from functools import wraps

from firebase_admin import firestore


class Snapshot:
    def __init__(self, ref, value):
        self.reference = ref
        self.id = ref.path.rsplit("/", 1)[-1]
        self.exists = value is not None
        self.value = copy.deepcopy(value)
    def to_dict(self): return copy.deepcopy(self.value)


class Ref:
    def __init__(self, db, path): self.db, self.path = db, path
    def get(self, **kwargs): return Snapshot(self, self.db.docs.get(self.path))
    def collection(self, name): return Collection(self.db, self.path + "/" + name)
    def delete(self): self.db.docs.pop(self.path, None)
    def update(self, data, **kwargs):
        if self.path not in self.db.docs: raise KeyError("update requires existing document")
        self.set(data, merge=True)
    def set(self, data, merge=False):
        value = copy.deepcopy(self.db.docs.get(self.path, {})) if merge else {}
        for key, item in data.items():
            if item is firestore.DELETE_FIELD:
                value.pop(key, None)
            elif item is firestore.SERVER_TIMESTAMP:
                value[key] = datetime.now(timezone.utc)
            elif isinstance(item, firestore.ArrayUnion):
                arr = value.setdefault(key, [])
                for entry in item.values:
                    if entry not in arr: arr.append(copy.deepcopy(entry))
            else:
                value[key] = copy.deepcopy(item)
        self.db.docs[self.path] = value


class Collection:
    def __init__(self, db, path): self.db, self.path = db, path
    def document(self, name): return Ref(self.db, self.path + "/" + name)
    def get(self, **kwargs):
        prefix = self.path + "/"
        return [Snapshot(Ref(self.db, path), value) for path, value in list(self.db.docs.items())
                if path.startswith(prefix) and "/" not in path[len(prefix):]]


class Transaction:
    def __init__(self): self.writes = []
    def set(self, ref, data, merge=False): self.writes.append(("set", ref, data, merge))
    def update(self, ref, data): self.writes.append(("update", ref, data, False))
    def commit(self):
        for action, ref, data, merge in self.writes:
            if action == "set": ref.set(data, merge=merge)
            else: ref.update(data)
        self.writes.clear()


class DB:
    def __init__(self): self.docs = {}
    def collection(self, name): return Collection(self, name)
    def transaction(self): return Transaction()


def transactional(work):
    """Commit queued writes after callback returns, like a successful SDK txn."""
    @wraps(work)
    def run(tx, *args, **kwargs):
        result = work(tx, *args, **kwargs)
        tx.commit()
        return result
    return run
