import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { Layout } from "./ui";
import { Login, Verify } from "./pages/Auth";
import { Profile } from "./pages/Profile";
import { ChallengePublic, Explore, OrgPublic } from "./pages/Public";
import { AdminChallenge, AdminHome, AdminOrg } from "./pages/Admin";
import "./styles.css";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Explore />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/verify" element={<Verify />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/o/:slug" element={<OrgPublic />} />
        <Route path="/o/:slug/c/:cslug" element={<ChallengePublic />} />
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/o/:slug" element={<AdminOrg />} />
        <Route path="/admin/o/:slug/c/:cslug" element={<AdminChallenge />} />
        <Route path="*" element={<div className="empty"><p className="hand">Page not found</p></div>} />
      </Routes>
    </Layout>
  );
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter>,
);
