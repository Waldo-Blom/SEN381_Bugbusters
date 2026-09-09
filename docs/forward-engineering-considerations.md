## Forward Engineering Considerations
The considerations below identify why each concern is relevant to the current engineering baseline, which later decisions or activities it may influence, what information is still required before a responsible decision can be made, and the potential consequence of ignoring the concern.

**Security, Authentication and Access Control**
Security and access control already influence the CivicConnect baseline because the system will store requester information and provide different levels of access to Requesters, Staff and Management. Requests are also restricted according to department, while requester contact information may only be released to Staff after Management approval. This means that later architecture and implementation decisions must support controlled access rather than treating all authenticated users in the same way. The current requirements already establish department-based access and management-controlled contact information. 
**Later decision/activity influenced:** Authentication architecture, role-based access control, department-based permissions, database relationships, API access rules, security testing and deployment configuration. 
**Information still missing:** Final authentication technology, detailed role and permission structure, session or token mechanism, password-storage approach and the technical method used to represent Management approval of contact-information access. 
**Risk if ignored:** Security may be introduced too late in the design process, which could require significant redesign or result in unauthorised users gaining access to requests or requester information

**Data Persistence, Integrity, Auditability and Recovery**
Reliable data storage is very important when it comes to the CivicConnect project because currently the operational processes suffer from requests being lost, duplicated, overlooked or poorly tracked. The new system must therefore preserve request information, assignments, status changes, resolution details and lifecycle history reliably. 
**Later decision/activity influenced:** Database technology, schema design, relationships, transaction handling, audit logging, backup and recovery planning. 
**Information still missing:** Final database technology, persistence model, audit fields, retention requirements, backup frequency and recovery approach. 
**Risk if ignored:** Poor data design could recreate the original business problem by allowing request records or accountability information to become incomplete, inconsistent or unrecoverable. 

**Testability, Verification and CI Quality Gates**
The requirements and acceptance criteria defined during M1 will determine whether the team can later prove that CivicConnect works correctly. The current PED already requires measurable evidence, automated testing and Continuous Integration rather than relying only on claims that the code works. 
**Later decision/activity influenced:** Test strategy, unit/integration/system testing, testing framework selection, GitHub Actions configuration, merge quality gates and release evidence. 
**Information still missing:** Final technology stack, testing tools, build process, CI workflow, performance-test conditions and quality thresholds. 
**Risk if ignored:** Requirements may be implemented without reliable verification evidence, while vague acceptance criteria could become difficult to test later. 

**Deployment, Storage, Free-Tier Limits and Operational Cost**
CivicConnect must operate within free or low-cost constraints, but the final hosting, database and storage environment has not yet been selected. Features such as image uploads, persistent data, email notifications and authentication may all consume limited platform resources. The PED already identifies free-tier limits as an engineering constraint. 
**Later decision/activity influenced:** Hosting platform, database service, image-storage approach, email service, deployment pipeline and operational-cost decisions. 
**Information still missing:** Storage quotas, database limits, bandwidth limits, image-size limits, expected usage volumes, email-service restrictions and final deployment platform. 
**Risk if ignored:** The selected solution may work during development but exceed free-tier limits, create unexpected costs or require late redesign of storage and deployment components. 

**Responsive UI and Stakeholder-Specific Mobile Use**
Requester-facing mobile accessibility is already part of the baseline, while the extent of mobile responsiveness for Staff and Management has deliberately been deferred. This means the team must support requester mobile use without prematurely committing to making every interface fully responsive. 
**Later decision/activity influenced:** Wireframes, responsive layouts, browser support, UI architecture, usability testing and refinement of NFR-401. 
**Information still missing:** Staff and Management mobile-use requirements, final dashboard complexity, target screen sizes and supported browser/version range. 
**Risk if ignored:** The team could either overcommit to full mobile responsiveness and increase development effort unnecessarily or create requester-facing screens that are difficult to use on mobile devices.
