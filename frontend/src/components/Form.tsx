import React from 'react';
import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useNavigate } from 'react-router-dom';
import { ACCESS_TOKEN, REFRESH_TOKEN } from '../utils/constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import '../styles/Form.css';
import LoadingIndicator from './LoadingIndicator';
import { useTeams } from '../hooks/useTeams';
import { LoginPayload, RegisterPayload } from '../types';
import { toast } from 'sonner';

interface FormProps {
  route: string;
  method: 'login' | 'register';
  onSuccess?: () => void;
}

function Form({ route, method, onSuccess }: FormProps) { 
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [role, setRole] = useState('0')
    const [teamId, setTeamId] = useState('')
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()
    
    const isRegister = method === 'register'
    const { teams } = useTeams({ autoLoad: isRegister })

    const name = method === 'login' ? 'Connexion' : 'Inscription'

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const payload: LoginPayload | RegisterPayload = isRegister 
              ? {
                  username,
                  password,
                  first_name: firstName,
                  last_name: lastName,
                  role,
                  teamId: teamId || null,
                }
              : {
                  username,
                  password,
                };
            
            const response = await api.post(route, payload)
            if (onSuccess) {
                onSuccess();
            } else if ( method === 'login' ) {
                localStorage.setItem(ACCESS_TOKEN, response.data.access)
                localStorage.setItem(REFRESH_TOKEN, response.data.refresh)
                navigate('/')
            } else {
                navigate('/login')
            }
        } catch (error) {
            const data = error?.response?.data || {};
            const message = data.detail || Object.values(data).flat().join(', ') || 'Une erreur est survenue';
            toast.error(message);
        } finally {
            setLoading(false)
        }
    }


    return <form onSubmit={handleSubmit} className="form-container">
        <h1>{name}</h1>
        <div className="form-field">
            <Label>Username</Label>
            <input 
                className="form-input"
                onChange={(e) => setUsername(e.target.value)}
                value={username}
                type="text" 
                name="username" 
                placeholder="Username"
                required />
        </div>
        <div className="form-field">
            <Label>Password</Label>
            <input 
                className="form-input"
                onChange={(e) => setPassword(e.target.value)}
                value={password}
                type="password" 
                name="password" 
                placeholder="Password"
                required />
        </div>
        
        {isRegister && (
            <>
                <div className="form-field">
                    <Label>Prénom</Label>
                    <input 
                        className="form-input"
                        onChange={(e) => setFirstName(e.target.value)}
                        value={firstName}
                        type="text" 
                        name="firstName" 
                        placeholder="Prénom" />
                </div>
                
                <div className="form-field">
                    <Label>Nom</Label>
                    <input 
                        className="form-input"
                        onChange={(e) => setLastName(e.target.value)}
                        value={lastName}
                        type="text" 
                        name="lastName" 
                        placeholder="Nom" />
                </div>
                
                <div className="form-field">
                    <Label>Rôle</Label>
                    <Select value={role} onValueChange={setRole}>
                        <SelectTrigger className="form-input">
                            <SelectValue placeholder="Sélectionner un rôle" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="0">Administrateur</SelectItem>
                            <SelectItem value="1">Conseiller</SelectItem>
                            <SelectItem value="2">Gestionnaire</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                
                <div className="form-field">
                    <Label>Équipe (optionnel)</Label>
                    <Select value={teamId || "none"} onValueChange={(value) => setTeamId(value === "none" ? "" : value)}>
                        <SelectTrigger className="form-input">
                            <SelectValue placeholder="Sélectionner une équipe" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Aucune équipe</SelectItem>
                            {teams.map((team) => (
                                <SelectItem key={team.id} value={team.id}>
                                    {team.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </>
        )}
        
        {loading && <LoadingIndicator />}
        <button className="form-button" type="submit">{name}</button>
    </form>
}
export default Form;