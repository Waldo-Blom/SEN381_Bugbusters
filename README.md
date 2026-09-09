# SEN381 Bugbusters - CivicConnect Project 

## Project Overview

CivicConnect is a digital platform designed to address operational challenges faced by a community-focused organization in managing citizen service requests. The organization currently manages requests through fragmented channels (email, telephone, WhatsApp, spreadsheets, paper-based protocols), resulting in duplicated, overlooked, or lost requests with no visibility into status or management oversight.

The CivicConnect platform provides a reliable, unified way for citizens to submit, staff to manage, and management to monitor service requests, ensuring accountability and operational efficiency.

### The Problem

The community-focused organization experiences:
- Duplicated and lost service requests across multiple channels
- No visibility for requesters into request status
- Difficulty coordinating and prioritizing tasks for staff
- Lack of management information on outstanding, overdue, and resolved work
- No centralized tracking mechanism

## Key Stakeholders

CivicConnect serves five distinct stakeholder groups with different needs:

1. **Product Owner** - Community-focused organization defining requirements and business needs
2. **Development Team (Bugbusters)** - Waldo Blom, Christian Janse van Rensburg, Marco Reiners
3. **Requesters** - Citizens submitting service requests and tracking status
4. **Staff** - People who are assigned to investigate and resolve requests
5. **Management** - Department managers overseeing staff and monitoring request resolution

# Live Atrifacts
The following documents are maintained throughout the project lifecycle and updated as engineering decisions and requirements evolve:
- [Project Scope](./docs/scope-baseline.md)
- [Risk Register](./docs/registers/risk-register.md)
- [Decision Log](./docs/registers/decision-log.md)
- [AI Usage Register](./docs/registers/ai-usage-register.md)

# Project Master Brief
See `docs\PED\SEN381 Master Project Brief.pdf` for the comlete breakdown of project requirements


## GitHub Workflow & Development Practices
GitHub is a tool but just because you make use of GitHub does not mean that you applied proper software engineering. In this project we applied software software engineering practices as follows:
### Branch Strategy

We follow a **main/dev branching model** with temporary feature branches to ensure code quality and maintain a clean development history.

#### Main Branches
- **`main`**: Production-ready code
  - Fully protected branch (cannot accept direct commits)
  - Requires pull requests for all changes
  - Requires 2 approvals before merge
  - Force pushes are blocked
  - Deletions are blocked
  - Admin bypass is disabled
  
- **`dev`**: Integration branch for active development
  - Protected branch with similar rules to main
  - Used for testing feature integration before production release

#### Feature Branches
Temporary feature branches are created from `dev` or `main` and use naming prefixes to categorize work:

```
docs/<description>                      # Documentation updates (e.g., docs/ai-usage-register-m1-waldo)
feature/<requirement-id>-<description>  # New functionality (e.g., feature/FR-implement-login)
```

**Example branches:**
- `docs/problem-and-business-need`
- `docs/ai-usage-register-m1-waldo`
- `feature/FR-implement-login`
- `feature/NFR-improve-login-loading-time`

**Branch Cleanup:** Feature branches are deleted after merging to keep the repository clean and structured. Before deletion, the branch is merged into the relevant target branch (main or dev), and all commit history is preserved in the target branch.

### Pull Requests & Code Review

Every change goes through a structured code review process:

1. **Create a feature branch** from `dev` or `main`
2. **Make commits** in your local environment with clear commit messages
3. **Open a pull request** with:
   - Descriptive title linked to the requirement or issue
   - Detailed description of changes
   - Reference to related issue(s) where applicable
4. **Code review** by team members (Marco, Christian, or Waldo)
   - Reviewers examine code quality, logic, and adherence to standards
   - Feedback is provided through PR comments
   - Changes are requested if needed
5. **Address feedback** and commit additional changes as needed
6. **Approval** by all required reviewers (minimum 2 approvals for main branch)
7. **Merge** the PR into target branch
   - Merge conflicts are resolved in the feature branch before final merge
   - Branch is deleted at the start of a new Milestone

**Important Notes:**
- Self-approval is not permitted. Authors cannot approve their own PRs.
- The ruleset enforces these requirements automatically.

### Issues & Task Management

#### Creating and Managing Issues
- Create a **New issue** on GitHub for each task
- Provide clear **Title** and **Description**
- Assign the issue to a **Milestone** (M1, M2, M3, or M4)
  - Every issue must be assigned to exactly one milestone
  - Milestone view shows completion percentage and helps track progress
- Apply relevant **Labels** for categorization
- Assign to the person responsible for the task (before starting work)
- Update status through linked pull requests

#### Linking Issues in Commits and Pull Requests
Reference issues in commit messages or PR descriptions to create automatic links:
```
git commit -m "Implement login form - closes #24"
git commit -m "Add password validation - fixes #18"
```

Keywords like `closes`, `fixes`, or `resolves` will automatically close the linked issue when the PR is merged.

### Milestones

GitHub milestones correspond directly to project milestones and represent the deliverables for each phase:

- **Milestone 1 (M1)**: Engineering Foundation & Requirements Baseline
- **Milestone 2 (M2)**: Architecture & Design Phase
- **Milestone 3 (M3)**: Implementation Phase
- **Milestone 4 (M4)**: Testing & Deployment Phase

Every issue must be assigned to exactly one milestone. The milestone view automatically shows completion percentage (based on closed vs. open issues) and helps the team verify if progress is on track or falling behind.

**View milestones:** https://github.com/Waldo-Blom/SEN381_Bugbusters/milestones

### Labels

Labels provide additional clarity and organization for issues and PRs. The labeling convention includes:

#### By Priority
- `priority: Urgent` - Blocking issues, critical bugs
- `priority: High` - Important but not a blocking issue
- `priority: Medium` - Normal priority
- `priority: Low` - Nice to have, can defer

#### By Task Type
- `Feature` - New functionality added
- `Bug` - Something isn't working
- `Enhancement` - Improve something or change existing behavior
- `Documentation` - Improvements or additions to documentation

#### By Work Type
- `Front end` - UI/Client side changes
- `Back end` - Server/API work
- `Database` - Data layer/queries

As the project evolves, additional labels may be added for extra clarity, or unused labels may be removed.

## Protected Branch Rules

The `main` and `dev` branches are protected with the following rulesets to ensure controlled development:

### Requires Pull Request Before Merging
- All commits must be made to a non-protected branch and submitted via a pull request before merging into main or dev
- Direct development on protected branches is not possible

### Requires Approvals
- Pull requests targeting `main` require a minimum of **2 approvals** from other team members
- This matches the project master brief requirement for controlled code review
- Self-approval is not permitted

### Force Pushes Are Blocked
- The "Allow force pushes" setting is disabled
- Force pushes to protected branches are not permitted
- This prevents accidental history rewriting

### Deletions Are Blocked
- When "Allow deletions" is disabled, protected branches cannot be deleted
- This prevents accidental deletion of production and development branches

### No Admin Bypass
- The ruleset cannot be bypassed by admin privileges or roles
- All team members follow the same review and approval process


**Last Updated**: Milestone 1 - (9 Septemeber2026)
**Repository Status**: Active Development