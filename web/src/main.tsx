import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { Layout } from "./ui";
import { Login, Verify } from "./pages/Auth";
import { Profile } from "./pages/Profile";
import { ChallengePublic, Explore, Home, OrgPublic } from "./pages/Public";
import { Join } from "./pages/Team";
import { AdminJudging } from "./pages/Judging";
import { AdminResults } from "./pages/Results";
import { Verify as VerifyCert } from "./pages/Certificates";
import { Inbox } from "./pages/Inbox";
import { PlatformAudit, PlatformNews, PlatformOrgs, PlatformOverview, PlatformReview, PlatformUsers } from "./pages/Platform";
import { JudgeChallenge, JudgeHome, JudgeTeam } from "./pages/Judge";
import { AdminOverview } from "./pages/Overview";
import { AdminApplications } from "./pages/Applications";
import { AdminChallenge, AdminHome, AdminOrg } from "./pages/Admin";
import { Credits } from "./pages/Credits";
import "./styles.css";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/challenges" element={<Explore />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/verify" element={<Verify />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/o/:slug" element={<OrgPublic />} />
        <Route path="/o/:slug/c/:cslug" element={<ChallengePublic />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/admin/o/:slug/c/:cslug/applications" element={<AdminApplications />} />
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/o/:slug" element={<AdminOrg />} />
        <Route path="/admin/o/:slug/c/:cslug" element={<AdminOverview />} />
        <Route path="/admin/o/:slug/c/:cslug/judging" element={<AdminJudging />} />
        <Route path="/admin/o/:slug/c/:cslug/results" element={<AdminResults />} />
        <Route path="/verify/:code" element={<VerifyCert />} />
        <Route path="/credits" element={<Credits />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/platform" element={<PlatformOverview />} />
        <Route path="/platform/review" element={<PlatformReview />} />
        <Route path="/platform/orgs" element={<PlatformOrgs />} />
        <Route path="/platform/users" element={<PlatformUsers />} />
        <Route path="/platform/news" element={<PlatformNews />} />
        <Route path="/platform/audit" element={<PlatformAudit />} />
        <Route path="/judge" element={<JudgeHome />} />
        <Route path="/judge/:slug/:cslug" element={<JudgeChallenge />} />
        <Route path="/judge/:slug/:cslug/teams/:teamId" element={<JudgeTeam />} />
        <Route path="/admin/o/:slug/c/:cslug/edit" element={<AdminChallenge />} />
        <Route path="*" element={<div className="empty"><p className="hand">Page not found</p></div>} />
      </Routes>
    </Layout>
  );
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter>,
);
