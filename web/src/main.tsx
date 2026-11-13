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
import { Privacy, Terms } from "./pages/Legal";
import "./styles.css";

/**
 * Browsers draw an animated SVG favicon as a still, so the tab icon blinks by swapping two static frames, in step
 * with the logo dot (1.2s: lit for about half, dim for the rest). Stays lit for people who ask for less motion.
 */
function blinkFavicon() {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;
    const frame = (opacity: number) => "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111111"/><circle cx="32" cy="32" r="15" fill="#c8321f" opacity="${opacity}"/></svg>`);
    const lit = frame(1), dim = frame(0.2);
    let on = true, timer = 0;
    const tick = () => { on = !on; link.href = on ? lit : dim; };
    const run = () => { window.clearInterval(timer); if (document.visibilityState === "visible") timer = window.setInterval(tick, 600); else { on = true; link.href = lit; } };
    document.addEventListener("visibilitychange", run);
    run();
  } catch { /* the static icon in index.html stays */ }
}
blinkFavicon();

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
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
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
