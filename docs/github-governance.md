## 16. GitHub Governance

Link to our repo: https://github.com/Waldo-Blom/SEN381_Bugbusters

GitHub is a tool but just because you make use of GitHub does not mean that you applied proper software engineering. In order to apply software engineering, you need to apply software engineering practices. The following below describes exactly how we will use GitHub throughout the project to ensure these best practices.

### 16.1 Branches

We will have two main branches that we will use `main` and `dev`. From these two branches we will branch out further into subbranches referred to as feature branches.

M2 review: After research conducted in assignment 3, we introduced a testing branch to run our automated CI checks. All current code resides on testing. We also created a staging branch, but its implementation is deferred to M3 as it depends on our deployment environment. The staging branch currently contains only documentation, though branch protection rules are already in place. `main` also currently contains only documentation. All code is on testing.

M3 review: During M3, the team decided to stop using the `dev` branch entirely. The original M1 plan had `main` and `dev`, with feature branches merging into `dev` and then `dev` merging into testing. This introduced an unnecessary extra integration step and an additional pull request for every change. Moving from `dev` to testing would have slowed down development and prevented continuous testing and integration. By not utilizing `dev`, all feature branches now branch directly from testing and merge back into testing via a pull request. This allows every change to be validated by the full CI pipeline before it joins the shared integration branch, which directly supports the team's goal of continuous integration and continuous development. The `dev` branch is therefore no longer part of the workflow.

According to our project brief the `main` branch should be treated as a fully protected branch that does not allow commits on the branch unless through a pull request and detailed review. We achieve this through applying a ruleset to the `main` and `dev` branch with the following settings:

- **Requires a pull request before merging:** All commits must be made to a non-protected branch and submitted via a pull request before they can be merged into main. Direct development on main it is therefore not possible.
- **Requires approvals:** Pull requests targeting main require a minimum number of approvals. We have set the required number of approvals before merging to 2 thereby matching the project master brief.
- **Force pushes are blocked:** The "Allow force pushes" setting is disabled, so force pushes to main are not permitted.
- **Deletions are blocked:** When the "Allow deletions" setting is disabled, the `main` and `dev` branch can't be deleted (Just to avoid accidental deletion of our production and development branches)
- **Do not allow bypassing the above settings:** This setting just makes sure no matter the role that the above-mentioned settings can be bypassed by admin privileges or roles.

M2 review: The team identified a collaboration risk: requiring 2 independent reviewers on a 3-person team could create bottlenecks if either reviewer is unavailable, potentially stalling progress and leading to larger, riskier merges. The `dev` branch approval requirement has therefore been adjusted to 1 independent approval to mitigate this risk while maintaining peer review and code quality. The same applies for the testing branch. The staging branch however follows the same rules as `main` requiring 2 independent reviews.

The testing branch follows the same protection as `dev` (1 independent approval) and additionally requires the CI status check to pass before merging. The staging branch has branch protection rules in place, but CI integration will be completed in M3 when deployment is established, along with the configuration of the "require deployments to succeed before merging" rule.

For the full ruleset of our repo please see: https://github.com/Waldo-Blom/SEN381_Bugbusters/settings/rules

| Branch | Role | Required approvals | Required CI checks | Additional protections |
| :--- | :--- | :--- | :--- | :--- |
| Main | Production / documentation baseline | 2 independent approvals | Yes (CI gate) | Force pushes blocked, deletions blocked, no bypassing settings |
| Staging | Release candidate / staging deployment | 2 independent approvals | Yes (CI gate) | Force pushes blocked, deletions blocked, no bypassing settings |
| Testing | Continuous integration branch | 1 independent approval | Yes (CI gate) | Force pushes blocked, deletions blocked, no bypassing settings |
| Feature / fix / docs | Short-lived development branches | None (author's own branch) | CI runs on PR into testing | Branches are deleted after merging |

Let's take a practical example:

Waldo was assigned the following task to complete: "Documentation for "Problem and business need"". Now he has to go and make a change on the `problem-and-business-need.md` file (stored in the docs folder). Instead of just working on the branch `main` (which is against the project spec and not good software engineering practices (as you would never develop straight on the live version of company software)), he instead creates an entire new branch called `docs/waldo-m1-artifacts`. He then in his own local environment makes changes to that mentioned .md file, either through single or multiple commits (whatever fits his use case).

Note: We use naming prefixes (like `docs/` and `feature/`) to categorize the type of work. GitHub utilizes these prefixes by allowing us to filter branches by name, making it easy to see all documentation branches or all feature branches at once, this helps to improve navigation and organization in the repository (Github, 2025).

Here are other examples of feature branches from our naming convention:

- `docs/ai-usage-register-m1-waldo`
- `feature/NFR-improve-login-loading-time`
- `feature/FR-implement-login`

As the project evolves, we might add additional branching prefixes, we will identify where certain changes align and agree on a prefix for that code change type. When a new one is added we will also update it in the `Github-governance.md` file, under the docs folder of our repo.

Note branches get deleted after each milestone, this is done to keep the repo clean and structured, so we don't end up with for example 70 feature branches that are no longer used. But before deleting a feature branch it is first merged with the relevant branch either `main`, `dev` or `testing` depending on the scenario and then that branch absorbs the feature branch commits and changes through the PR, nothing is lost and the commit history is kept, that branch just can be accessed anymore but this is fine.

See our current branches here: https://github.com/Waldo-Blom/SEN381_Bugbusters/branches

### 16.2 Pull requests (PR's) and Code review process

Marco and Christian then first have to review this change within the pull request, treating the Pull request (PR) as a place to do a code review, meaning they look at Waldo's proposed changes and then comments and gives feedback. After both Marco and Christian approve this change made by Waldo (Waldo can't approve his own changes, he only verifies that his work is indeed correct before opening a pull request). This applies for all members, the scenario above is just for demonstrative purposes.

As per our Ruleset, the main branch requires at least 2 approvals (enforced automatically). We do not allow self-approval on any branch that requires reviews. Any merge conflicts are then resolved (if there are any).

Example PR: https://github.com/Waldo-Blom/SEN381_Bugbusters/pull/2

Also note that in some cases we held code reviews on discord where the author would show the team / team member what they did, showcasing what was changed, how it linked to a specific requirement, how that requirement was met and how the behaviour was tested:

Example PR as evidence: https://github.com/Waldo-Blom/SEN381_Bugbusters/pull/110

### 16.3 Issues

When referring to issues in GitHub we don't necessarily mean it in terms of a software bug (Github, 2025). This refers to a specific task that has to be completed (Github, 2025). For our project we start by identifying what the deliverables are for a specific milestone and then assign we distribute the workload and assign specific tasks to specific people. But just because one person is in charge of a specific part of the workload does not mean that person is the only one working on that, we look at what that person has done and then review it and incorporate our feedback.

Example issue: https://github.com/Waldo-Blom/SEN381_Bugbusters/issues/3

### 16.4 Milestones

The milestones on our GitHub page relate to the actual milestones of this project i.e. Milestone 1 on GitHub consists of the issues that are related to Milestone 1 project deliverables.

Every issue must be assigned to only one milestone (M1, M2, M3, or M4). Assigning issues to milestones allows us to track our overall progress, the milestone view automatically shows what percentage is complete (based on closed vs. open issues) and helps us see if we are on track or falling behind.

Link Milestones: https://github.com/Waldo-Blom/SEN381_Bugbusters/milestones

### 16.5 Labels

We use labels in our PR's and issues just to mark issues more clearly, for example:

By priority:

- `priority: Urgent` - Blocking issues, critical bugs etc
- `priority: High` - important but not a blocking issue
- `priority: Medium` - normal priority
- `priority: Low` - Nice to have, can defer

By the task type:

- `Feature` - New functionality added
- `Documentation` - Improvements or additions to documentation
- `Bug` - Something isn't working
- `Enhancement` - Improve something / change an existing behaviour

By the type of work:

- `Front end` - UI / Client side changes
- `Back end` - Server / API work
- `Database` - Data layer / queries

In the future as the project evolves, we might add additional labels as we see fit in order to provide extra clarity where necessary. Or we might remove some that are not used.

Link to the labels: https://github.com/Waldo-Blom/SEN381_Bugbusters/labels

### 16.6 CI / Automated Checks

The project uses a GitHub Actions Continuous Integration (CI) pipeline, defined in `.github/workflows/ci.yml` as a workflow named CI. It has grown from the single build-and-test job of M2 into a set of independent jobs covering static analysis, dependency and secret scanning, four automated test suites, a database check, and a final CI gate check.

#### Triggers and concurrency

The pipeline runs on pushes to `dev`, testing, staging and `main`, on pull requests targeting any of those branches, and on manual dispatch. Runs are grouped by workflow and Git ref, and a newer run cancels an older in-progress run for the same ref, so obsolete commits do not consume runner time.

#### Shared setup

Every job runs on a fresh `ubuntu-latest` runner and uses an action (`.github/actions/setup-node/action.yml`). This action:

1. Sets up Node.js using the version pinned in `.nvmrc`.
2. Installs dependencies with `npm ci --include=dev`, giving a clean, reproducible install from `package-lock.json`.
3. Builds the Tailwind CSS (`npm run build:css`). The dependency audit and database check skip this step because they do not need it.

#### Jobs

| Job | What it does |
| :--- | :--- |
| Static analysis (`lint`) | `npm run lint` (ESLint with Prettier integration) and `npx prettier --check .` for formatting. |
| Dependency check (`dependency-audit`) | `npm audit --omit=dev --audit-level=high`. High or critical vulnerabilities in production dependencies fail the job. |
| Secret scan (`secret-scan`) | Gitleaks 8.18.4 scans the full Git history (fetch-depth: 0) for committed secrets, with output redacted. |
| Unit tests (`unit-tests`) | Jest unit project (`src/**/__tests__/`). Database operations are mocked, and `DATABASE_URL` is a harmless local placeholder. |
| Functional tests (`functional-tests`) | Jest functional project (`tests/functional/`). Black-box requester workflows (registration, login, request submission, lookup and history) run against the real Express app via Supertest, with the model layer mocked. |
| Neon database check (`db-test`) | `npm run db:test` connects to the CI Neon database, confirms it is `civicconnect_dev`, verifies that all 11 expected tables exist in the public schema, and runs basic row-count reads. |
| Integration and API tests (`integration`) | Jest integration project (`tests/integration/`), covering attachments, contact access, health, manager listing, reporting, requests and staff access. Database-backed suites run against Neon. Runs only after `db-test` succeeds. |
| E2E on simulated staging (`e2e`) | Starts the server in production mode, polls `/health` (which runs `SELECT 1` against Neon) then runs the Jest e2e project (`tests/e2e/`) for the critical requester journey. The server log is printed on failure and the server is always stopped afterwards. Runs only after `db-test` succeeds. |

Each job has its own timeout (10 minutes, or 15 for integration and E2E). A timeout fails that job and therefore the gate.

The test suites differ in scope. Unit, functional and E2E journey test make use of mock data. Only the integration suite and the database and health checks make use of the real Neon database.

Please note on previous commits there is also a performance test that "ran", it was for a blank folder that was planned to be implemented on staging, for performance testing on staging we rather made use of render for more accurate results in our simulated deployment environment (aka staging branch).

#### CI gate

The final CI gate job waits for all eight checks and runs with `if: always()`. It fails if any dependency result is failure, cancelled or skipped, so a skipped job can never count as a pass. A green gate means every check reported success.

#### Integration with branch protection

The CI gate job is the single required status check for branch protection. This replaces the earlier `CI / build-and-test` check from M2. Branch-specific review requirements (such as the 1 independent approval on testing described in Section 16.1) apply in addition to the CI requirement, so no change that fails linting, scanning, tests or the database check can be merged into a protected branch. Requiring this check is configured in the GitHub repository settings or ruleset, not in the workflow file itself.

#### Secret handling

No secrets are committed to the repository, and Gitleaks now enforces this on every run. Two secrets are injected through GitHub Actions repository secrets:

- `CI_SESSION_SECRET` supplies the `SESSION_SECRET` required by express-session in the unit, functional, integration and E2E jobs.
- `NEON_DATABASE_URL` supplies the CI database connection for `db-test`, integration and e2e.

#### Scope and deliberate exclusions

The pipeline is a verification pipeline only. It contains no deployment, release, container build, database migration or artifact-upload job. Performance testing is not part of CI and is handled separately through Render. As with any automated pipeline, a green run shows that the configured checks passed. It does not prove that every behaviour is tested or that the production environment is identical to the testing environment.

#### Evidence and traceability

The workflow configuration is at `.github/workflows/ci.yml` and the shared setup action is at `.github/actions/setup-node/action.yml`. The test suites live in `src/**/__tests__/` (unit), `tests/functional/`, `tests/integration/` and `tests/e2e/`, with Jest projects defined in `jest.config.js`.

Evidence of the CI gate blocking a failing change:

CI block for M2: https://github.com/Waldo-Blom/SEN381_Bugbusters/pull/47

This PR was opened with a deliberately failing test to show that the required status check blocks merging. It will be closed without merging, confirming that no failing code could enter the protected branch.

CI block for M3: https://github.com/Waldo-Blom/SEN381_Bugbusters/pull/119

To demonstrate the CI gate, we opened Pull Request #119. This change is designed to fail the unit, functional, lint and E2E jobs. Because the CI gate requires every job to succeed, a single failure fails the gate and blocks the merge, so no incorrect change can enter a protected branch. The PR will be closed without merging, so the regression never reaches testing.