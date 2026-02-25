def notify_session_archived(*args, **kwargs):
    from api.consumers import notify_session_archived as _fn
    return _fn(*args, **kwargs)

def notify_session_update(*args, **kwargs):
    from api.consumers import notify_session_update as _fn
    return _fn(*args, **kwargs)

def notify_session_completed(*args, **kwargs):
    from api.consumers import notify_session_completed as _fn
    return _fn(*args, **kwargs)

def notify_table_released(*args, **kwargs):
    from api.consumers import notify_table_released as _fn
    return _fn(*args, **kwargs)

__all__ = [
    'notify_session_archived',
    'notify_session_update', 
    'notify_session_completed',
    'notify_table_released',
]