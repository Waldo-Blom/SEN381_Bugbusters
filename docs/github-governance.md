## 14. GitHub Governance

Link to our repo: https://github.com/Waldo-Blom/SEN381_Bugbusters

GitHub is a tool but just because you make use of GitHub does not mean that you applied proper software engineering. In order to apply software engineering, you need to apply software engineering practices. The following below describes exactly how we will use GitHub throughout the project to ensure these best practices.

### 14.1 Branches

We will have two main branches that we will use `main` and `dev`. From these two branches we will branch out further into subbranches referred to as feature branches.

M2 review: After research conducted in assignment 3, we introduced a testing branch to run our automated CI checks. All current code resides on testing. We also created a staging branch, but its implementation is deferred to M3 as it depends on our deployment environment. The staging branch currently contains only documentation, though branch protection rules are already in place. `main` also currently contains only documentation. All code is on testing.

According to our project brief the `main` branch should be treated as a fully protected branch that does not allow commits on the branch unless through a pull request and detailed review. We achieve this through applying a ruleset to the `main` and `dev` branch with the following settings:

- **Requires a pull request before merging:** All commits must be made to a non-protected branch and submitted via a pull request before they can be merged into main. Direct development on main it is therefore not possible.
- **Requires approvals:** Pull requests targeting main require a minimum number of approvals. We have set the required number of approvals before merging to 2 thereby matching the project master brief.
- **Force pushes are blocked:** The "Allow force pushes" setting is disabled, so force pushes to main are not permitted.
- **Deletions are blocked:** When the "Allow deletions" setting is disabled, the `main` and `dev` branch can't be deleted (Just to avoid accidental deletion of our production and development branches)
- **Do not allow bypassing the above settings:** This setting just makes sure no matter the role that the above-mentioned settings can be bypassed by admin privileges or roles.

M2 review: The team identified a collaboration risk: requiring 2 independent reviewers on a 3-person team could create bottlenecks if either reviewer is unavailable, potentially stalling progress and leading to larger, riskier merges. The `dev` branch approval requirement has therefore been adjusted to 1 independent approval to mitigate this risk while maintaining peer review and code quality. The same applies for the testing branch. The staging branch however follows the same rules as `main` requiring 2 independent reviews.

The testing branch follows the same protection as `dev` (1 independent approval) and additionally requires the CI status check to pass before merging. The staging branch has branch protection rules in place, but CI integration will be completed in M3 when deployment is established, along with the configuration of the "require deployments to succeed before merging" rule.

For the full ruleset of our repo please see: https://github.com/Waldo-Blom/SEN381_Bugbusters/settings/rules

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

### 14.2 Pull requests (PR's) and Code review process

Marco and Christian then first have to review this change within the pull request, treating the Pull request (PR) as a place to do a code review, meaning they look at Waldo's proposed changes and then comments and gives feedback. After both Marco and Christian approve this change made by Waldo (Waldo can't approve his own changes, he only verifies that his work is indeed correct before opening a pull request). This applies for all members, the scenario above is just for demonstrative purposes.

As per our Ruleset, the main branch requires at least 2 approvals (enforced automatically). We do not allow self-approval on any branch that requires reviews. Any merge conflicts are then resolved (if there are any).

Example PR: https://github.com/Waldo-Blom/SEN381_Bugbusters/pull/2

### 14.3 Issues

When referring to issues in GitHub we don't necessarily mean it in terms of a software bug (Github, 2025). This refers to a specific task that has to be completed (Github, 2025). For our project we start by identifying what the deliverables are for a specific milestone and then assign we distribute the workload and assign specific tasks to specific people. But just because one person is in charge of a specific part of the workload does not mean that person is the only one working on that, we look at what that person has done and then review it and incorporate our feedback.

Example issue: https://github.com/Waldo-Blom/SEN381_Bugbusters/issues/3

### 14.4 Milestones

The milestones on our GitHub page relate to the actual milestones of this project i.e. Milestone 1 on GitHub consists of the issues that are related to Milestone 1 project deliverables.

Every issue must be assigned to only one milestone (M1, M2, M3, or M4). Assigning issues to milestones allows us to track our overall progress, the milestone view automatically shows what percentage is complete (based on closed vs. open issues) and helps us see if we are on track or falling behind.

Link Milestones: https://github.com/Waldo-Blom/SEN381_Bugbusters/milestones

### 14.5 Labels

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

### 14.6 CI / Automated Checks

For M2, we implemented a lightweight Continuous Integration (CI) pipeline using GitHub Actions. This pipeline runs automatically on every push and pull request targeting the testing branch and currently performs the following steps:

1. Checks out the repository.
2. Sets up Node.js using the version pinned in `.nvrmc` (Node 24), ensuring consistent runtime across developer machines and CI.
3. Installs dependencies using `npm ci`, producing a clean, reproducible install from `package-lock.json`.
4. Runs ESLint with Prettier integration to enforce code quality and formatting rules across all js files.
5. Runs the Jest test suite to execute automated tests.

The test suite currently contains a health check test (`tests/health.test.js`) that verifies the Express application boots and that the `/health` endpoint returns 200 OK. This provides initial automated verification that the application is functional and forms the first traceable link from requirement to verification evidence in the RTM.

Linting is deliberately scoped to JavaScript files only. ESLint does not natively parse `.ejs` templates, so `src/views/` and `src/public/` are excluded via `.eslintignore`. Template-level linting was assessed and deliberately deferred to M3, where a dedicated EJS syntax checker may be introduced.

#### Integration with branch protection

The CI pipeline is integrated with branch protection on testing: the status check `CI / build-and-test` must pass before a pull request can be merged. As per the M2 review in Section 14.1, the testing branch requires 1 independent approval (same as `dev`), and the CI check is a mandatory requirement in addition to peer review. This ensures that no code failing lint or tests can be merged into testing.

#### Secret handling

No secrets are committed to the repository. The `SESSION_SECRET` required by `express-session` is injected into the CI environment using GitHub Actions repository secrets. Production configuration of this secret is deferred to M3, where deployment environment variables will be formally established.

#### Scope and deliberate exclusions

The pipeline is intentionally minimal to meet M2 requirements without over-engineering. It does not include deployment, coverage thresholds, end-to-end tests, containerisation, or production observability. These are explicitly listed in the M2 brief as out of scope and are deferred to M3. In M3, the team plans to extend the pipeline to include automated deployment to a staging environment, broader test coverage, and additional quality gates as the project matures. Consideration will also be given to extending CI coverage to the `main` branch once a production release process is established.

#### Evidence and traceability

The workflow configuration is available at `.github/workflows/ci.yml`, and the initial test is located at `tests/health.test.js`.

Evidence of the CI gate blocking a failing change: https://github.com/Waldo-Blom/SEN381_Bugbusters/pull/47

This PR was opened with a deliberately failing test to demonstrate that the branch protection rule and required status check are functioning as configured. GitHub blocked the merge as expected. The PR will be closed without merging, confirming that no failing code could enter testing.