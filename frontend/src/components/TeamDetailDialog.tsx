import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { TeamDetail } from '../types';

interface TeamDetailDialogProps {
  team: TeamDetail | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TeamDetailDialog({ team, isOpen, onOpenChange }: TeamDetailDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="users-teams-dialog-content">
        <DialogHeader>
          <DialogTitle>{team?.team?.name}</DialogTitle>
        </DialogHeader>
        
        {team && (
          <div className="users-teams-team-detail-content">
            <div className="users-teams-team-members-section">
              <h3>Membres de l'équipe</h3>
              {team.members && team.members.length > 0 ? (
                <div className="users-teams-team-members-list">
                  {team.members.map((member) => (
                    <div key={member.userId} className="users-teams-team-member-item">
                      <div className="users-teams-team-member-info">
                        <p>{member.userData?.firstName} {member.userData?.lastName}</p>
                        <p className="users-teams-team-member-role">{member.userData?.role}</p>
                      </div>
                      {member.isLeader && (
                        <Badge>Chef d'équipe</Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="users-teams-empty-message">Aucun membre dans cette équipe</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

