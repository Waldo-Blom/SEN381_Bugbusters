# GitHub Governance

Link to our repo: https://github.com/Waldo-Blom/SEN381_Bugbusters

GitHub is a tool but just because you make use of GitHub does not mean that you applied proper software engineering. In order to apply software engineering you need to apply software engineering practices. The following below describes exactly how we will use GitHub throughout the project to ensure these best practices.

## Branches 

We will have two main branches that we will use `main` and `dev`. From these two branches we will branch out further into subbranches referred to as feature branches. 

According to our project brief the `main` branch should be treated as a fully protected branch that does not allow commits on the branch unless through a pull request and detailed review. We achieve this through applying a ruleset to the `main` and `dev` branch with the following settings:

- **Requires a pull request before merging:*** All commits must be made to a non protected branch and submitted via a pull request before they can be merged into main. Direct development on main it is therefore not possible.
- **Requires approvals:** Pull requests targeting main require a minimum number of approvals.We have set the required number of approvals before merging to 2 thereby matching the project master brief.
- **Force pushes are blocked:** The "Allow force pushes" setting is disabled, so force pushes to main are not permitted.
- **Deletions are blocked:** When the "Allow deletions" setting is disabled, the `main` and `dev` branch can't be deleted (Just to avoid accidental deletion of our production and development branches) 
- **Do not allow bypassing the above settings:** This setting just makes sure no matter the role that the above-mentioned settings can be bypassed by admin privileges or roles

Let's take a practical example:

Waldo was assigned the following task (issue) to complete: "Documentation for "Problem and business need"". Now he has to go and make a change on the `problem-and-business-need.md`file (stored in the docs folder). Instead of just working on the branch `main` (which is against the project spec and not good software engineering practices (as you would never develop straight on the live version of compony software)), he instead creates an entire new branch called `docs/waldo-m1-artifacts `. He then in his own local environment makes changes to that mentioned .md file, either through single or multiple commits (whatever fits his use case).

Note: We use naming prefixes (like docs/ and feature/) to categorize the type of work. GitHub utilizes these prefixes by allowing us to filter branches by name, making it easy to see all documentation branches or all feature branches at once, this helps to improve navigation and organization in the repository. Here are other examples of feature branches from our naming convention:

- docs/ai-usage-register-m1-waldo
- feature/NFR-improve-login-loading-time 
- feature/FR-implement-login

As the project evolves, we might add additional branching prefixes, we will identify where certain changes align and agree on a prefix for that code change type. When a new one is added we will also update it in the `Github-governace.md` file, under the docs folder of our repo.

Note branches get deleted after each milestone, this is done to keep the repo clean and structured, so we don't end up with for example 70 feature branches that are no longer used. But before deleting a feature branch it is first merged with the relevant branch either `main` or `dev` depending on the scenario and then that branch absorbs the feature branch commits and changes through the PR, nothing is lost and the commit history is kept, that branch just can be accessed anymore but this is fine.

See our current branches here: https://github.com/Waldo-Blom/SEN381_Bugbusters/branches 

## Pull requests (PR's) and Code review process

Marco and Christian then first have to review this change within the pull request, treating the Pull request (PR) as a place to do a code review, meaning they look at Waldo's proposed changes and then comments and gives feedback. After both Marco and Christian approve this change made by Waldo (Waldo can't approve his own changes, he only verifies that his work is indeed correct before opening a pull request). This applies for all members, the scenario above is just for demonstrative purposes. 

As per our Ruleset, the main branch requires at least 2 approvals (enforced automatically). We do not allow self-approval on any branch that requires reviews. Any merge conflicts are then resolved (if there are any).

Example PR: https://github.com/Waldo-Blom/SEN381_Bugbusters/pull/2 

## Issues

When referring to issues in GitHub we don't necessarily mean it in terms of a software bug (Github, 2025). This refers to a specific task that has to be completed (Github, 2025). For our project we start by identifying what the deliverables are for a specific milestone and then assign we distribute the workload and assign specific tasks to specific people. But just because one person is in charge of a specific part of the workload does not mean that person is the only one working on that, we look at what that person has done and then review it and incorporate our feedback.

Example issue: https://github.com/Waldo-Blom/SEN381_Bugbusters/issues/3 

## Milestones

The milestones on our GitHub page relate to the actual milestones of this project i.e. Milestone 1 on GitHub consists of the issues that are related to Milestone 1 project deliverables. 

Every issue must be assigned to only one milestone (M1, M2, M3, or M4). Assigning issues to milestones allows us to track our overall progress, the milestone view automatically shows what percentage is complete (based on closed vs. open issues) and helps us see if we are on track or falling behind. 

Link Milestones: https://github.com/Waldo-Blom/SEN381_Bugbusters/milestones 

## Labels

We use labels in our PR's and issues just to mark issues more clearly, for example:

- By priority:
  - `priority: Urgent` – Blocking issues, critical bugs etc
  - `priority: High` - important but not a blocking issue
  - `priority: Medium` - normal priority
  - `priority: Low` - Nice to have, can defer

- By the task type:
  - `Feature` - New functionality added
  - `Documentation` - Improvements or additions to documentation
  - `Bug` - Something isn't working
  - `Enhancement` - Improve something / change an existing behaviour

- By the type of work:
  - `Front end` - UI / Client side changes
  - `Back end` - Server / API work
  - `Database` - Data layer / queries

In the future as the project evolves, we might add additional labels as we see fit in order to provide extra clarity where necessary. Or we might remove some that are not used.

Link to the lables: https://github.com/Waldo-Blom/SEN381_Bugbusters/labels