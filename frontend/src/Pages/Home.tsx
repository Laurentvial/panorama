import React from "react";
import { useState, useEffect } from "react";
import api from "../utils/api";
import Note from "../components/Note";
import Sidebar from "../components/Sidebar";
import "../styles/NoteStyles.css";
import Header from "../components/Header";
import { Dashboard } from "../components/Dashboard";


function Home() {
  const [notes, setNotes] = useState([]);
  const [content, setContent] = useState("");

  useEffect(() => {
    getNotes();
  }, []);

  const getNotes = () => {
    api
      .get("/api/notes/")
      .then((response) => response.data)
      .then((data) => setNotes(data))
      .catch((error) => alert(error));
  };

  const deleteNote = (id: string) => {
    if (!id) {
      alert("Erreur: ID de la note manquant");
      return;
    }
    api
      .delete(`/api/notes/delete/${id}/`)
      .then((response) => {
        if (response.status === 204) alert("Note supprimée avec succès");
        else alert("Erreur lors de la suppression de la note");
        getNotes();
      })
      .catch((error) => alert(error))
  };

  const createNote = (e: React.FormEvent) => {
    e.preventDefault();
    api
      .post("/api/notes/create/", { text: content })
      .then((response) => {
        if (response.status === 200 || response.status === 201) alert("Note créée avec succès");
        else alert("Erreur lors de la création de la note");
        getNotes();
      })
      .catch((error) => alert(error))
      .then(() => setContent(""));
  };

  return (
    <div style={{ display: "Block", minHeight: "100vh" }}>
        
        {/* Header */}
        <Header user={'user'} onLogout={'onLogout'} />


        <div style={{ display: "flex" }}>

            {/* Navigation Bar */}
            <Sidebar currentPage={'home'} onNavigate={() => {}} userRole={'administrateur'} />

            {/* Main Content */}
            <div style={{ width: "100%", padding: "30px" }}>

                <Dashboard user={'user'} />
                <div style={{ padding: "40px 0px" }}>
                
                <div>
                    <h1>Notes</h1>
                    {notes.map((note) => <Note note={note} onDelete={deleteNote} key={note.id} />)}
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

        </div>
    </div>
  );
}

export default Home;
