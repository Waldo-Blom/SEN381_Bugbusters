## Evolved RTM
According to the CivicConnect Master Project Brief, the team must maintain one evolving Requirements Traceability Matrix (RTM), with requirements linked from their stakeholder/source through later design, implementation, testing and acceptance/release evidence. The Milestone 1 brief requires the initial RTM to establish traceability from the stakeholder/source to the requirement and acceptance criteria, while providing a structure that can be expanded with later lifecycle evidence. 
In this document, the source/stakeholder, requirement description, priority and acceptance criteria are already defined in the Functional and Non-Functional Requirements tables. The RTM therefore uses the Requirement ID as the link to these definitions and extends the traceability structure to future design/architecture, GitHub Issue/Pull Request, implementation, verification/testing and acceptance/release evidence. Fields relating to future milestones are marked as pending until the relevant controlled evidence is produced.

### Requester RTM
| Requirement ID | Design / Architecture | Issue / PR | Implementation Evidence | Verification / Test | Acceptance / Release Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| FR-101 | Request Management module; PostgreSQL service_requests + request_categories; Modular Monolith | PR #87 | requests.service.js, requests.model.js | submission.test.js, requests.functional.test.js | Pending - M4 |
| FR-102 | Request Management + Audit / Request History; service_requests status tracking | PR #87, #98, #112 | requests.controller.js:requesterDetail | submission.test.js, requests.functional.test.js | Pending - M4 |
| FR-103 | Request Management + Audit / Request History; requester-linked request persistence | PR #87, #98, #104 | requests.service.js:listForRequester, search query | requests.functional.test.js | Pending - M4 |
| FR-104 | Observer / Event-Based Pattern (ADR-005); NotificationService; Nodemailer / SMTP | PR #94, #109 | eventBus.js, email.service.js, notifications.listener.js | notifications.test.js | Pending - M4 |
| FR-105 | Authentication & User Management module; ASR-01; users table; Node.js / Express security boundary (ADR-004) | PR #88 | auth.service.js, auth.middleware.js, bcrypt | auth.test.js | Pending - M4 |
| FR-106 | request_attachments persistence design; external durable file storage; final storage provider deferred to M3 | PR #110, #112 | requests.attachments.service.js, S3 integration | attachments.service.test.js, attachments.integration.test.js | Pending - M4 |

### Staff RTM
| Requirement ID | Design / Architecture | Issue / PR | Implementation Evidence | Verification / Test | Acceptance / Release Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| FR-201 | Assignment & Workflow module; service_requests assignment model + assignment history | PR #92 | workflow.service.js:assignToSelf | assignment.test.js, staff-access.test.js | Pending - M4 |
| FR-202 | Centralised Workflow FSM / Transition Service (ADR-006); RequestWorkflowService; status-history persistence | PR #84 | requests.model.js:updateStatus FSM | requestworkflow.regression.test.js | Pending - M4 |
| FR-203 | Search, Reporting & Dashboard module; indexed request filtering by status/category/assignment | PR #95, #108 | requests.model.js:searchStaffRequests | staff-search.test.js | Pending - M4 |
| FR-204 | Request Workflow + request_comments; resolution/action audit information | PR #84, #104 | requests.model.js:addComment | requests.controller.test.js | Pending - M4 |
| FR-205 | ASR-01 Controlled Access; Request Management + department/role authorisation boundary | PR #97 | requests.service.js:getForStaff, contact restriction | staff-access.test.js, staff-access.integration.test.js | Pending - M4 |
| FR-206 | Centralised Workflow FSM (ADR-006); RequestWorkflowService; resolution/closure persistence | PR #84 | requests.model.js:updateStatus | requests.service.test.js | Pending - M4 |
| FR-207 | ASR-01; Department-Based Access; staff_assignments + departments + request_categories (DEC-007) | PR #95 | requests.access.js:requireStaffAccess | department-access.test.js | Pending - M4 |

### Management RTM
| Requirement ID | Design / Architecture | Issue / PR | Implementation Evidence | Verification / Test | Acceptance / Release Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| FR-301 | Search, Reporting & Dashboard module; service_requests + departments; status/overdue query design | PR #90 | reporting.service.js:getDashboardStats | dashboard.test.js, reporting-stats.integration.test.js | Pending - M4 |
| FR-302 | Audit & Request History module; request_status_history, request_assignment_history, request_comments, admin_audit_log; ADR-005 | PR #98 | audit.service.js, admin_audit_log | audit.test.js, history.test.js | Pending - M4 |
| FR-303 | Assignment & Workflow module; service_requests + request_assignment_history; ASR-02 | PR #106 | workflow.service.js:managerAssign | management-assignment.test.js | Pending - M4 |
| FR-304 | Search, Reporting & Dashboard module; category/status/department persistence and indexed query design | PR #90, #96 | reporting.service.js:getDashboardActivity | dashboard-activity.test.js | Pending - M4 |
| FR-305 | ASR-01 Controlled Access; management authorisation; contact_information_approved, contact_approved_by, contact_approved_at (DEC-007) | PR #97 | requests.contactaccess.service.js | contact-access.test.js, contact-access.integration.test.js | Pending - M4 |

### Operator RTM (Added M3)
| Requirement ID | Design / Architecture | Issue / PR | Implementation Evidence | Verification / Test | Acceptance / Release Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| FR-401 | Requests Module; operatorSubmitRequest; external_requesters + service_requests (created_by); Modular Monolith | PR #87 | src/modules/requests/requests.controller.js (operatorSubmitRequest), requests.service.js:createServiceRequest | src/modules/requests/__tests__/submission.test.js | Pending - M4 |
| FR-402 | Validation Schema; validateExternalRequester; DB constraint service_requests_exactly_one_requester | PR #87 | src/modules/requests/requests.schema.js, src/modules/requests/views/partials/external-requester-fields.ejs | src/modules/requests/__tests__/submission.test.js | Pending - M4 |
| FR-403 | Requests Module; indexed external_requesters search ILIKE query | PR #87 | src/modules/requests/requests.model.js (searchExternalRequesters, findExternalRequesterById) | src/modules/requests/__tests__/submission.test.js | Pending - M4 |
| FR-404 | Requests Module; operatorLoggedRequests; creator-filtered lookup | PR #87 | src/modules/requests/requests.controller.js:operatorLoggedRequests, views/operator/logged-requests.ejs | src/modules/requests/__tests__/submission.test.js | Pending - M4 |