
## Initial RTM
According to the CivicConnect Master Project Brief, the team must maintain one evolving Requirements Traceability Matrix (RTM), with requirements linked from their stakeholder/source through later design, implementation, testing and acceptance/release evidence. The Milestone 1 brief requires the initial RTM to establish traceability from the stakeholder/source to the requirement and acceptance criteria, while providing a structure that can be expanded with later lifecycle evidence. 
In this document, the source/stakeholder, requirement description, priority and acceptance criteria are already defined in the Functional and Non-Functional Requirements tables. The RTM therefore uses the Requirement ID as the link to these definitions and extends the traceability structure to future design/architecture, GitHub Issue/Pull Request, implementation, verification/testing and acceptance/release evidence. Fields relating to future milestones are marked as pending until the relevant controlled evidence is produced.

### Requester RTM
| Requirement ID | Design / Architecture | Issue / PR | Implementation Evidence | Verification / Test | Acceptance / Release Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| FR-101 | Request Management module; PostgreSQL service_requests + request_categories; Modular Monolith | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-102 | Request Management + Audit / Request History; service_requests status tracking | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-103 | Request Management + Audit / Request History; requester-linked request persistence | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-104 | Observer / Event-Based Pattern (ADR-005); NotificationService; Nodemailer / SMTP | Pending - M3 | emailService.js structural stub; EventEmitter logic Pending - M3 | Pending - M3 | Pending - M4 |
| FR-105 | Authentication & User Management module; ASR-01; users table; Node.js / Express security boundary (ADR-004) | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-106 | request_attachments persistence design; external durable file storage; final storage provider deferred to M3 | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |

### Staff RTM
| Requirement ID | Design / Architecture | Issue / PR | Implementation Evidence | Verification / Test | Acceptance / Release Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| FR-201 | Assignment & Workflow module; service_requests assignment model + assignment history | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-202 | Centralised Workflow FSM / Transition Service (ADR-006); RequestWorkflowService; status-history persistence | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-203 | Search, Reporting & Dashboard module; indexed request filtering by status/category/assignment | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-204 | Request Workflow + request_comments; resolution/action audit information | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-205 | ASR-01 Controlled Access; Request Management + department/role authorisation boundary | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-206 | Centralised Workflow FSM (ADR-006); RequestWorkflowService; resolution/closure persistence | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-207 | ASR-01; Department-Based Access; staff_assignments + departments + request_categories (DEC-007) | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |

### Management RTM
| Requirement ID | Design / Architecture | Issue / PR | Implementation Evidence | Verification / Test | Acceptance / Release Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| FR-301 | Search, Reporting & Dashboard module; service_requests + departments; status/overdue query design | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-302 | Audit & Request History module; request_status_history, request_assignment_history, request_comments, admin_audit_log; ADR-005 | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-303 | Assignment & Workflow module; service_requests + request_assignment_history; ASR-02 | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-304 | Search, Reporting & Dashboard module; category/status/department persistence and indexed query design | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |
| FR-305 | ASR-01 Controlled Access; management authorisation; contact_information_approved, contact_approved_by, contact_approved_at (DEC-007) | Pending - M3 | Pending - M3 | Pending - M3 | Pending - M4 |