import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, SignedInOnly } from "./auth";
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
        <Route path="/profile" element={<SignedInOnly><Profile /></SignedInOnly>} />
        <Route path="/o/:slug" element={<OrgPublic />} />
        <Route path="/o/:slug/c/:cslug" element={<ChallengePublic />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/admin/o/:slug/c/:cslug/applications" element={<SignedInOnly><AdminApplications /></SignedInOnly>} />
        <Route path="/admin" element={<SignedInOnly><AdminHome /></SignedInOnly>} />
        <Route path="/admin/o/:slug" element={<SignedInOnly><AdminOrg /></SignedInOnly>} />
        <Route path="/admin/o/:slug/c/:cslug" element={<SignedInOnly><AdminOverview /></SignedInOnly>} />
        <Route path="/admin/o/:slug/c/:cslug/judging" element={<SignedInOnly><AdminJudging /></SignedInOnly>} />
        <Route path="/admin/o/:slug/c/:cslug/results" element={<SignedInOnly><AdminResults /></SignedInOnly>} />
        <Route path="/verify/:code" element={<VerifyCert />} />
        <Route path="/credits" element={<Credits />} />
        <Route path="/inbox" element={<SignedInOnly><Inbox /></SignedInOnly>} />
        <Route path="/platform" element={<SignedInOnly><PlatformOverview /></SignedInOnly>} />
        <Route path="/platform/review" element={<SignedInOnly><PlatformReview /></SignedInOnly>} />
        <Route path="/platform/orgs" element={<SignedInOnly><PlatformOrgs /></SignedInOnly>} />
        <Route path="/platform/users" element={<SignedInOnly><PlatformUsers /></SignedInOnly>} />
        <Route path="/platform/news" element={<SignedInOnly><PlatformNews /></SignedInOnly>} />
        <Route path="/platform/audit" element={<SignedInOnly><PlatformAudit /></SignedInOnly>} />
        <Route path="/judge" element={<SignedInOnly><JudgeHome /></SignedInOnly>} />
        <Route path="/judge/:slug/:cslug" element={<SignedInOnly><JudgeChallenge /></SignedInOnly>} />
        <Route path="/judge/:slug/:cslug/teams/:teamId" element={<SignedInOnly><JudgeTeam /></SignedInOnly>} />
        <Route path="/admin/o/:slug/c/:cslug/edit" element={<SignedInOnly><AdminChallenge /></SignedInOnly>} />
        <Route path="*" element={<div className="empty"><p className="hand">Page not found</p></div>} />
      </Routes>
    </Layout>
  );
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter>,
);
