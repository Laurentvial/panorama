import React from 'react';
import { Button } from './ui/button';
import { X } from 'lucide-react';
import Form from './Form';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: () => void;
}

export function CreateUserModal({ isOpen, onClose, onUserCreated }: CreateUserModalProps) {
  if (!isOpen) return null;

  function handleUserRegistered() {
    onClose();
    onUserCreated();
  }

  return (
    <div 
      className="users-team-modal-overlay"
      onClick={onClose}
    >
      <div 
        className="users-team-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="users-team-modal-header">
          <h2 className="users-team-modal-title">Créer un utilisateur</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="users-team-modal-close"
          >
            <X className="users-teams-icon" />
          </Button>
        </div>
        <Form 
          route="/api/users/create/" 
          method="register"
          onSuccess={handleUserRegistered}
        />
      </div>
    </div>
  );
}

