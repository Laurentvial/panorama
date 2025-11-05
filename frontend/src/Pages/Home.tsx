import React from "react";
import { useState, useEffect } from "react";
import api from "../utils/api";
import Note from "../components/Note";
import "../styles/NoteStyles.css";
import { Dashboard } from "../components/Dashboard";
import { useUser } from "../contexts/UserContext";
import { toast } from "sonner";


function Home() {
  const [notes, setNotes] = useState([]);
  const [content, setContent] = useState("");
  const { currentUser } = useUser();
  
  useEffect(() => {
    getNotes();
  }, []);
  
  const getNotes = () => {
    api
      .get("/api/notes/")
      .then((response) => response.data)
      .then((data) => setNotes(data))
      .catch((error) => toast.error(error?.message || 'Erreur lors du chargement des notes'));
  };

  const deleteNote = (id: string) => {
    if (!id) {
      toast.error("Erreur: ID de la note manquant");
      return;
    }
    api
      .delete(`/api/notes/delete/${id}/`)
      .then((response) => {
        if (response.status === 204) toast.success("Note supprimée avec succès");
        else toast.error("Erreur lors de la suppression de la note");
        getNotes();
      })
      .catch((error) => toast.error(error?.message || 'Erreur lors de la suppression'))
  };

  const createNote = (e: React.FormEvent) => {
    e.preventDefault();
    api
      .post("/api/notes/create/", { text: content })
      .then((response) => {
        if (response.status === 200 || response.status === 201) toast.success("Note créée avec succès");
        else toast.error("Erreur lors de la création de la note");
        getNotes();
      })
      .catch((error) => toast.error(error?.message || 'Erreur lors de la création'))
      .then(() => setContent(""));
  };

  return (
    <div>
      <Dashboard user={currentUser} />
      <div style={{ padding: "40px 0px" }}>
        <div>
          <h1>Notes</h1>
          {notes.map((note: any) => (
            <Note key={note.id} note={note} onDelete={deleteNote} />
          ))}
        </div>
        <div>
          <h2>Créer une note</h2>
          <form onSubmit={createNote} className="form-container">
            <label htmlFor="content">Contenu</label>
            <textarea id="content" name="content" required value={content} onChange={(e) => setContent(e.target.value)} />
            <input type="submit" value="Créer"></input>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Home;
