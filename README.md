# CivicConnect

**SEN381 · Team Bugbusters · Belgium Campus ITversity**

CivicConnect is a web platform that gives a community-focused organisation one reliable place for citizens to submit service requests, for staff to resolve them, and for management to monitor the work.

**Status:** Active development. Milestone 2 (Architecture & Design baseline) submitted. Milestone 3 (Implementation) is next.

---

## Table of Contents

1. [The Problem](#the-problem)
2. [Stakeholders and Roles](#stakeholders-and-roles)
3. [Key Features](#key-features)
4. [Tech Stack](#tech-stack)
5. [Data Model](#data-model)
6. [Getting Started](#getting-started)
7. [Project Documentation (Live Artefacts)](#project-documentation-live-artefacts)
8. [Engineering Practices](#engineering-practices)
9. [Team](#team)

---

## The Problem

The organisation currently handles requests through email, telephone, WhatsApp, spreadsheets and paper protocols. This leads to:

- Duplicated, overlooked or lost requests
- No visibility for requesters into the status of their request
- Difficulty coordinating and prioritising work for staff
- No management information on outstanding, overdue and resolved work
- No central tracking mechanism

CivicConnect replaces these fragmented channels with a single, accountable workflow.

## Stakeholders and Roles

| Role | What they do in CivicConnect |
|------|------------------------------|
| **Requester** | Self-registers, submits requests (with optional images), tracks status, views history, receives optional email notifications |
| **Staff** | Sees requests in their department, accepts responsibility, updates status, records resolution details and closes requests |
| **Management** | Oversees one department: dashboard (open / overdue / resolved / closed), assigns and reassigns requests, approves access to requester contact details, can revert a closure |
| **Admin** | Registers management users and manages staff across all departments |
| **Product Owner** | The organisation defining the business need; reviews each milestone (does not submit requests) |

## Key Features

- Email and password registration and login (no social login)
- Request submission using a controlled category list, routed to the relevant department only
- Image attachments (images only; size limit to be finalised against free-tier storage)
- Status tracking through a controlled workflow: `SUBMITTED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED` (`REJECTED` as an exception state)
- Staff self-assignment within their department, with management override
- Search, filter and sort for staff and management
- Management dashboard and full audit history of status and assignment changes
- Requester contact details hidden by default; released to staff only after manager approval
- Optional email notifications on status change
- Mobile-friendly requester screens

**Out of scope:** AI chatbot, internal real-time messaging, video upload, voice input, social login.
**Deferred:** grouping duplicate requests, staff review portal, cross-department metrics role, full mobile support for staff and management.

## Tech Stack

A JavaScript-centric MVC web application, chosen for a three-person team on a short schedule and free-tier hosting.

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime / API | Node.js 24 + Express | I/O-bound workload, one language across the stack |
| Frontend | EJS (server-side rendering) + Tailwind CSS | Fast page loads, less client state, easy responsive layouts |
| Database | PostgreSQL | Relational integrity, row-level locking, JSONB for audit payloads |
| DB access | node-postgres (`pg`) | Transaction blocks for atomic status transitions |
| Email | Nodemailer (SMTP) | Ethereal in dev/test, Gmail SMTP in production |
| Quality gates | Jest, ESLint (+ Prettier), GitHub Actions | Automated evidence on every PR |

## Data Model

Core entities: `users`, `departments`, `staff_assignments`, `request_categories`, `service_requests`, `request_attachments`, `request_comments`, `request_status_history`, `request_assignment_history`, `admin_audit_log`.

View the full ERD on [dbdiagram.io](https://dbdiagram.io/d/CivicConnect_BugBusters-6ab7b2250f25a52d0113c01b).

## Getting Started

### Prerequisites

- Node.js 24 (version pinned in `.nvmrc`; use `nvm use`)
- PostgreSQL `<version>` (local install or a hosted free-tier instance)

### Setup

```bash
git clone https://github.com/Waldo-Blom/SEN381_Bugbusters.git
cd SEN381_Bugbusters
nvm use
npm ci
cp .env.example .env   
```

### Environment variables

Secrets are never committed. Copy `.env.example` to `.env` and set:

| Variable | Purpose |
|----------|---------|
| `SESSION_SECRET` | Signs `express-session` cookies |
| `DATABASE_URL` | PostgreSQL connection string (TODO: confirm name) |
| `NODE_ENV` | Selects the email transport (Ethereal vs Gmail) |
| `<SMTP variables>` | TODO: Gmail app-password settings |

### Run, test and lint

Run these in two terminals during development:

```bash
npm run watch:css    # Tailwind: builds src/public/styles/output.css, then rebuilds on change
npm run dev          # Express with nodemon (auto-restart), runs src/server.js
```

All available scripts:

| Command | What it does |
|---------|--------------|
| `npm run watch:css` | Compile Tailwind CSS and keep watching for changes |
| `npm run dev` | Start the app with nodemon (auto-restarts on file changes) |
| `npm start` | Start the app with Node (no auto-restart) |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint and auto-fix problems |
| `npm run format` | Format the whole repo with Prettier |
| `npm test` | Run the Jest test suite |
| `npm run test:watch` | Run Jest in watch mode |

Before opening a PR, run `npm run lint` and `npm test`. These are the same checks the CI pipeline runs.

## Project Documentation (Live Artefacts)

These are updated throughout the project as decisions and requirements evolve.

| Document | Location |
|----------|----------|
| Master project brief | [`docs/PED/SEN381 Master Project Brief.pdf`](./docs/PED/SEN381%20Master%20Project%20Brief.pdf) |
| Project scope | [`docs/scope-baseline.md`](./docs/scope-baseline.md) |
| Risk register | [`docs/registers/risk-register.md`](./docs/registers/risk-register.md) |
| Decision log | [`docs/registers/decision-log.md`](./docs/registers/decision-log.md) |
| AI usage register | [`docs/registers/ai-usage-register.md`](./docs/registers/ai-usage-register.md) |
| GitHub governance | [`docs/github-governance.md`](./docs/github-governance.md) |

Requirements are traced through the RTM in the PED using stable IDs (`FR-1xx` requester, `FR-2xx` staff, `FR-3xx` management, `NFR-` by quality category).

## Engineering Practices

We use a protected branching model and mandatory peer review. The short version:

| Branch | Purpose | Merge rules |
|--------|---------|-------------|
| `main` | Production-ready | PR only, 2 approvals, no force push, no deletion, no admin bypass |
| `staging` | CI and final testing before `main` | PR only, 1 approval, `CI / build-and-test` must pass |
| `dev` | Active integration | PR only, 1 approval |
| `feature/<id>-<desc>`, `docs/<desc>` | Temporary work branches | Cut from `dev` or `main`, deleted after merge |

- Authors cannot approve their own PRs.
- Every issue belongs to exactly one milestone (M1 to M4) and is linked from commits and PRs (`closes #24`).
- CI (GitHub Actions) runs lint and tests on every push and PR to `staging`.
- Labels cover priority, task type and work type.

Full details, including branch naming, PR process, issue and label conventions, are in [`docs/github-governance.md`](./docs/github-governance.md).

**Milestones**

| Milestone | Focus |
|-----------|-------|
| M1 | Engineering foundation and requirements baseline |
| M2 | Architecture and design |
| M3 | Implementation |
| M4 | Testing and deployment |

Track progress on the [milestones page](https://github.com/Waldo-Blom/SEN381_Bugbusters/milestones).

## Team

| Name | Student no. |
|------|-------------|
| Waldo Blom | 578068 |
| Christian Janse van Rensburg | 601840 |
| Marco Reiners | 578056 |

*Last updated: Milestone 2, 29 September 2026*