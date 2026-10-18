# CivicConnect

**SEN381 · Team Bugbusters · Belgium Campus ITversity**

CivicConnect is a web application for submitting and managing community service requests. Requesters can submit and track requests, operational staff can work on requests for their departments, and managers can monitor activity and oversee departmental workloads.

> [!IMPORTANT]
> **M4 final submission — release candidate tag `V1.0.2`. Final classification: CONDITIONALLY READY. Final deployment state: STAGING. Production release decision: NO-GO.** This build is for milestone review and demonstration only. It is not intended for actual deployment to `main` or use as a production service. The hosted instance is a staging environment.

**Staging demo:** [https://civicconnect-staging.onrender.com/](https://civicconnect-staging.onrender.com/)

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [M4 final decision and release status](#m4-final-decision-and-release-status)
- [Known defects and incomplete functionality](#known-defects-and-incomplete-functionality)
- [Demo accounts](#demo-accounts)
- [Install and run locally](#install-and-run-locally)
- [Project documentation](#project-documentation)
- [Team](#team)

## Features

- Requester registration, sign-in, request submission, status tracking, and request history
- Request categories routed to the responsible department
- Image attachments on service requests
- Operator-assisted request capture on behalf of external requesters
- Staff request search, filtering, department-scoped access, and self-assignment
- Manager-approved access to requester contact details
- Request status workflow with comments and lifecycle history
- Manager dashboards, request assignment and reassignment, and audit history
- Admin and manager tools for department and staff management
- Optional email notifications for request status changes
- Responsive requester experience

## Technology stack

| Area | Technology |
|---|---|
| Runtime and server | Node.js 24, Express |
| Web pages and styling | EJS, Tailwind CSS |
| Database | PostgreSQL, accessed with `pg` (node-postgres) |
| Authentication and sessions | Express sessions, bcrypt |
| Email | Nodemailer with SMTP; Ethereal is used for development/testing |
| File storage | Amazon S3-compatible object storage for request attachments |
| Tests and quality checks | Jest, Supertest, ESLint, Prettier, GitHub Actions |
| Staging hosting | Render; staging database hosted on Neon |

## M4 final decision and release status

- **Final readiness classification:** CONDITIONALLY READY
- **Final deployment state:** STAGING
- **Production release decision:** NO-GO (pending the release conditions below)

**Summary.** M4 was a finalisation and stabilisation phase, not a new development phase. With a three-person team, a short schedule and a free-tier budget, we took a risk-based approach: fix the most important defects that could be fixed within our constraints, avoid adding features we could not properly verify, and be transparent about what remains. The core architecture, stakeholder workflows, staging deployment and automated verification demonstrate a working system (final scope completion is about 97% against the in-scope items and RTM). However, a working staging demo is not the same as a production-ready service, so we have deliberately **not** approved a production go-live.

**What we did in M4**

- **Fixed:** Operator request editing ([#122](https://github.com/Waldo-Blom/SEN381_Bugbusters/issues/122), urgent) was resolved in PR #129, because it restored functionality belonging to the approved Operator role.
- **Retained as a known limitation:** SMTP email delivery on Render's free tier ([#124](https://github.com/Waldo-Blom/SEN381_Bugbusters/issues/124)). This is a hosting restriction, not a code defect, and resolving it requires a paid plan, which conflicts with the project's no-cost constraint.
- **Not implemented:** Password reset ([#123](https://github.com/Waldo-Blom/SEN381_Bugbusters/issues/123)). It depends on email delivery, and a partial or unverifiable reset flow would be a security risk.

**Conditions before production approval:** a hosting plan or email approach that supports reliable email delivery, working notifications and password recovery, closure or formal acceptance of high-priority defects, regression and acceptance verification on the final release candidate, broader performance and operational readiness checks (including backup and recovery), and controlled release approval via a tagged commit.

> **For the complete justification, evidence and reasoning behind this decision, see Section 20 of the M4 PED:** [SEN381 Milestone 4 PED (Version 4)](./docs/PED/Milestone%204/SEN381_Milestone4_Bugbusters%20(PEDV4).pdf)

## Known defects and incomplete functionality

These are the currently tracked open issues. Follow the [GitHub issue tracker](https://github.com/Waldo-Blom/SEN381_Bugbusters/issues) for status changes and any additional issues.

| Issue | Status | Current limitation |
|---|---|---|
| [#121 – Manager audit log export](https://github.com/Waldo-Blom/SEN381_Bugbusters/issues/121) | Open (deprioritised in M4) | The Export log action on the Report & Audit screen does not yet produce a usable export. |
| [#122 – Operator cannot edit logged request](https://github.com/Waldo-Blom/SEN381_Bugbusters/issues/122) | Fixed in M4 (PR #129) | Operators can now edit eligible requests they logged. |
| [#123 – Password reset](https://github.com/Waldo-Blom/SEN381_Bugbusters/issues/123) | Open | The password-reset page is present, but the complete secure reset flow is not implemented. |
| [#124 – Email delivery on Render's free tier](https://github.com/Waldo-Blom/SEN381_Bugbusters/issues/124) | Open (accepted limitation) | Render's free tier blocks outbound SMTP, so status-change emails cannot be delivered from the staging service. The request/status update still succeeds if email delivery fails. |
| [#125 – Timezone handling](https://github.com/Waldo-Blom/SEN381_Bugbusters/issues/125) | Open (technical debt) | Displayed times currently use a temporary South African timezone setting; a user-specific timezone approach is not implemented. |

## Demo accounts

The following shared mock accounts are provided so reviewers can explore the staging application and its different roles. **These credentials are intentionally published for this demonstration.** We understand that credentials should not be exposed in a real-world deployment; these accounts are test-only and must not be used for sensitive information or reused elsewhere.

All accounts use the password `Password@1234`.

| Role | Email | Password |
|---|---|---|
| Requester | `requester1.staging@example.com` | `Password@1234` |
| Staff member (Roads) | `staff.roads.staging@example.com` | `Password@1234` |
| Manager (Electricity) | `lerato.molefe@example.com` | `Password@1234` |
| Manager (Housing) | `ayesha.patel@example.com` | `Password@1234` |
| Manager (IT) | `alicecooper@gmail.com` | `Password@1234` |
| Manager (Parks) | `sipho.dlamini@example.com` | `Password@1234` |
| Manager (Roads) | `manager.roads.staging@example.com` | `Password@1234` |
| Manager (Sanitation) | `johan.vandermerwe@example.com` | `Password@1234` |
| Manager (Water) | `zanele.zulu@example.com` | `Password@1234` |
| Operator | `operator1.staging@example.com` | `Password@1234` |
| Admin | `admin.staging@example.com` | `Password@1234` |

## Install and run locally

### Prerequisites

- Node.js 24 and npm
- PostgreSQL, either local or a development database you are authorized to use
- Git

### Setup

```bash
git clone https://github.com/Waldo-Blom/SEN381_Bugbusters.git
cd SEN381_Bugbusters
npm ci
```

Copy `.env.example` to `.env` and configure the local development settings. In PowerShell, use `Copy-Item .env.example .env`; on macOS/Linux, use `cp .env.example .env`.

| Variable | Purpose |
|---|---|
| `PORT` | Local web server port (defaults to `3000`) |
| `SESSION_SECRET` | Secret used to sign session cookies; set a unique local value |
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | PostgreSQL port (usually `5432`) |
| `DB_DATABASE` | Database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `EMAIL_HOST` | SMTP server host for email testing |
| `EMAIL_PORT` | SMTP server port |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASS` | SMTP password or app password |

Do not commit `.env` or real credentials. The example file contains blank values; fill in the configuration required for your local database and email setup. SMTP email delivery is not available from the public Render free-tier deployment; see [issue #124](https://github.com/Waldo-Blom/SEN381_Bugbusters/issues/124).

Start the CSS watcher and application in separate terminals:

```bash
npm run watch:css
```

```bash
npm run dev
```

The application runs locally at `http://localhost:3000` unless you set another `PORT`.

### Available development commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server with automatic restart |
| `npm start` | Start the application without the development watcher |
| `npm run watch:css` | Build and watch Tailwind CSS |
| `npm test` | Run the Jest test suite |
| `npm run test:watch` | Run Jest in watch mode |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with automatic fixes |
| `npm run format` | Format project files with Prettier |

## Project documentation

### Project Engineering Document progression

These milestone PEDs show how the project evolved from its initial requirements and engineering baseline through implementation, testing, staging, and the final project.

| Milestone | PED |
|---|---|
| M1 – Engineering foundation and requirements baseline | [SEN381 Milestone 1 PED (Version 1)](./docs/PED/Milestone%201/SEN381_Milestone1_Bugbusters%20(PED_V1).pdf) |
| M2 – Architecture and design | [SEN381 Milestone 2 PED (Version 2)](./docs/PED/Milestone%202/SEN381_Milestone2_Bugbusters%20(PEDV2).pdf) |
| M3 – Implementation, testing, and staging | [SEN381 Milestone 3 PED (Version 3)](./docs/PED/Milestone%203/SEN381_Milestone3_Bugbusters%20(PEDV3).pdf) |
| M4 – Final project (see Section 20 for the final go-live decision) | [SEN381 Milestone 4 PED (Version 4)](./docs/PED/Milestone%204/SEN381_Milestone4_Bugbusters%20(PEDV4).pdf) |

- [Master Project Brief](./docs/PED/SEN381%20Master%20Project%20Brief.pdf)
- [Project scope](./docs/scope-baseline.md)
- [Requirements traceability matrix](./docs/registers/rtm.md)
- [Risk register](./docs/registers/risk-register.md)
- [Technical debt register](./docs/registers/techical-debt-register.md)
- [Decision log](./docs/registers/decision-log.md)
- [AI usage register](./docs/registers/ai-usage-register.md)
- [GitHub workflow and governance](./docs/github-governance.md)

## Team

| Name | Student number |
|---|---:|
| Waldo Blom | 578068 |
| Christian Janse van Rensburg | 601840 |
| Marco Reiners | 578056 |