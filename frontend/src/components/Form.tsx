import React from 'react';
import { useState } from 'react';
import api from '../utils/api';
import { useNavigate } from 'react-router-dom';
import { ACCESS_TOKEN, REFRESH_TOKEN } from '../utils/constants';
import '../styles/Form.css';
import LoadingIndicator from './LoadingIndicator';


function Form({ route, method }) { 
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()


    const name = method === 'login' ? 'Connexion' : 'Inscription'

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await api.post(route, { username, password })
            if ( method === 'login' ) {
                localStorage.setItem(ACCESS_TOKEN, response.data.access)
                localStorage.setItem(REFRESH_TOKEN, response.data.refresh)
                navigate('/')
            } else {
                navigate('/login')
            }
        } catch (error) {
            const data = error?.response?.data || {};
            const message = data.detail || Object.values(data).flat().join(', ') || 'Une erreur est survenue';
            alert(message)
        } finally {
            setLoading(false)
        }
    }


    return <form onSubmit={handleSubmit} className="form-container">
        <h1>{name}</h1>
        <input 
            className="form-input"
            onChange={(e) => setUsername(e.target.value)}
            value={username}
            type="text" 
            name="username" 
            placeholder="Username" />
        <input 
            className="form-input"
            onChange={(e) => setPassword(e.target.value)}
            value={password}
            type="password" 
            name="password" 
            placeholder="Password" />
        {loading && <LoadingIndicator />}
        <button className="form-button" type="submit">{name}</button>
    </form>
}
export default Form;