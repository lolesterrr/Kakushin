import React, { useEffect } from "react";
import { Link } from "react-router-dom";

// Plain-language policies. Change the wording here; the app links to these pages from the footer and sign-in screens.
const CONTACT = "hello@kakushinhub.site";
const UPDATED = "November 2026";

function Doc({ title, children }: { title: string; children: React.ReactNode }) {
  useEffect(() => { document.title = `${title} · Kakushin`; }, [title]);
  return (
    <div className="section legal">
      <h1>{title}</h1>
      <p className="muted">Last updated {UPDATED}. Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
      {children}
    </div>
  );
}

export function Privacy() {
  return (
    <Doc title="Privacy policy">
      <p>Kakushin is a place to find and run innovation challenges and hackathons. This page explains what we keep about you, why, who can see it, and how to remove it.</p>

      <h2>What we keep</h2>
      <ul>
        <li><b>Your email address</b>, to sign you in with a one-time link or code. There is no password.</li>
        <li><b>Your profile</b>: name, and if you add them, institution, location, skills, bio, links and gender. Gender is optional and only used, if at all, in counts that do not name anyone.</li>
        <li><b>What you do in challenges</b>: the teams you create or join, your team's application answers, pitch decks, video and demo links, and certificates you earn.</li>
        <li><b>If you judge</b>: the scores and comments you give.</li>
        <li><b>If you organise</b>: your organisation's details, logo, challenges and announcements.</li>
        <li><b>Notifications</b>: your inbox, the organisations and topics you follow, and if you use the phone app and allow it, a push token for your device.</li>
        <li><b>Technical data</b>: one sign-in cookie that keeps you signed in for up to 30 days, and your IP address, which is used briefly to stop sign-in abuse and is not stored with your account.</li>
      </ul>

      <h2>Who can see it</h2>
      <ul>
        <li>Organisers of a challenge you apply to see your team, its members' names, institutions and email addresses, your application and your pitch.</li>
        <li>Judges of that challenge see the pitches of the teams they score.</li>
        <li>Published results show winning and finalist team names and their members' names to everyone.</li>
        <li>Anyone with a certificate's code can check it, and sees the name, award, challenge and organiser printed on it.</li>
        <li>We do not sell your data or show you advertising.</li>
      </ul>

      <h2>Services that handle it for us</h2>
      <ul>
        <li><b>Cloudflare</b> hosts the site, the database and uploaded files, and runs the check that stops bots signing in.</li>
        <li><b>Brevo</b> and <b>Resend</b> deliver our emails.</li>
        <li><b>Expo</b> delivers push notifications to the phone app.</li>
      </ul>
      <p>These services may store data outside your country. They only use it to provide their service to us.</p>

      <h2>How long we keep it</h2>
      <p>Your account and what you added stay until you delete your account. Sign-in links and codes expire after 15 minutes and are cleared every hour. Sign-in sessions end after 30 days.</p>

      <h2>Your choices</h2>
      <ul>
        <li>See and correct your details on your <Link to="/profile">profile</Link>.</li>
        <li>Turn push notifications off in the app, and unfollow organisations or topics at any time.</li>
        <li>Delete your account from your <Link to="/profile#delete">profile</Link>, in the app or on the web. This removes your profile, team places, certificates, inbox and scores you gave. A team you led passes to a teammate.</li>
        <li>Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> for a copy of your data or anything else about it.</li>
      </ul>
      <p>We aim to follow the Data Protection and Privacy Act, 2019 of Uganda, and comparable laws where our users live.</p>

      <h2>Children</h2>
      <p>Kakushin is for people aged 16 and over. If you are younger, ask a parent, guardian or your school before you sign up.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we will tell you in your inbox before the change applies.</p>
    </Doc>
  );
}

export function Terms() {
  return (
    <Doc title="Terms of use">
      <p>By using Kakushin you agree to these terms. They are short on purpose. Our <Link to="/privacy">privacy policy</Link> explains how we handle your data.</p>

      <h2>Your account</h2>
      <ul>
        <li>Use your own email address and real name. Keep access to your email safe, because it is how you sign in.</li>
        <li>You are responsible for what happens under your account.</li>
        <li>You can delete your account at any time from your profile.</li>
      </ul>

      <h2>Challenges and organisers</h2>
      <ul>
        <li>Each challenge is run by its organiser, not by Kakushin. The organiser sets its rules, judging, prizes and any terms about the work teams submit, and is responsible for awarding prizes.</li>
        <li>Organisers must describe their challenge honestly, judge fairly against the criteria they publish, and only use participants' details to run the challenge.</li>
        <li>We may review, pause or remove a challenge or organisation that breaks these terms.</li>
      </ul>

      <h2>Your work</h2>
      <ul>
        <li>You keep ownership of your ideas, pitches and anything you upload, unless the organiser's challenge terms say otherwise. Read them before you apply.</li>
        <li>You let us store and show your uploads to the people who need them for the challenge: your team, the organisers and the judges.</li>
        <li>Only upload what you have the right to share.</li>
      </ul>

      <h2>Do not</h2>
      <ul>
        <li>Harass people, impersonate anyone, or post anything unlawful or hateful.</li>
        <li>Try to get into accounts or data that are not yours, or disrupt the service.</li>
        <li>Send spam through announcements or invites.</li>
      </ul>
      <p>We may suspend accounts that do.</p>

      <h2>Certificates</h2>
      <p>Certificates are issued by the organiser of each challenge through Kakushin. Anyone can check one with its code. An organiser or Kakushin may revoke a certificate issued by mistake or obtained unfairly.</p>

      <h2>The service</h2>
      <p>We work to keep Kakushin running and your data safe, but we provide it as it is, without guarantees that it will always be available or free of errors. As far as the law allows, we are not liable for indirect losses, or for prizes or decisions made by organisers.</p>

      <h2>Changes</h2>
      <p>We may update these terms. If a change matters, we will tell you in your inbox before it applies. Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
    </Doc>
  );
}
