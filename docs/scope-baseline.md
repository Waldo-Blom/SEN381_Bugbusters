## 2. Scope Baseline & Constraints

### 2.1 Scope Baseline

#### 2.1.1 In Scope

These are the core features and things that our application will and must be able to do. These are the things that we are promising to ensure that our system will perform, this is the baseline scope and will be adjusted as the project progresses (note in the event that the scope is adjusted we will properly document these changes):

1. **User login, registration and authentication**

   Requesters will be able to register and log in to access account specific functionality. They will also be able to update their personal information and settings such as if they want receive email push notifications.

   This authentication will also help with staff and management functionality as they will also have accounts. This will help with things such as staff being assigned to a specific department and also to a specific management person.

   M2 Review: IN PEDv1 we established register for Requesters, Management and Staff. After further consideration we identified in PEDV2 that requesters will be able to self-register. Management will register staff for only their department. A special Admin user will register the management users and will also be able to manage staff across all departments.

2. **Requesters submit a new service request**

   Requesters will be able to submit a new service request containing all the required information.

3. **Add images to a request**

   Requesters will also be able to attach images to a specific request in the event that it is needed. However, images will be limited to a certain file size (still to be determined at a later stage what this established limitation is, as it depends on the database architecture limitations and free tier availability).

4. **Controlled request categorization**

   Requesters will select a request category from a list of available categories. These categories will then be used to make the request available to the relevant department. For example, IT related issues will only go to the IT department and NOT across the all the departments. This will help to better keep track of what the issue pertains to.

5. **Status tracking of a request**

   The requesters will be able to view the current status of their submitted request as it changes.

   Staff will be able to change the status of only the issues they are assigned to.

   Management then also has the dashboard view of the different requests and their status within their department and which staff member is assigned to the specific issue

6. **View request history**

   Requesters will be able to view the history of their previously submitted requests.

   Managers will also be able to view all the past requests logged within their department.

   Staff will be able to view their assigned request history.

7. **Feedback via email push notification.**

   As an additional feature that we will implement is the ability for requesters to receive email notifications as their status of their task changes. This feature will be able to be toggled on / off. This is also why we require a user registration with email as we will use this email address to send the push notifications to.

8. **Search and filter requests**

   Staff and Management will be able to search, filter and sort available service requests using relevant criteria.

9. **View requester details**

   Authorized staff will be permitted access to contact details associated with a requester. This is how the staff member will be able to get further clarification on an issue if required. The manager must first approve access to this information for the staff member.

10. **Assign / accept responsibility**

    Authorized staff will be able to accept responsibility for the appropriate unassigned requests. Meaning that they will be able to assign themselves to a specific request only within their department.

11. **Management assign and reassignment**

    Although staff are able to assign themselves to a task within their department, management still has the ability to assign or reassign service requests to the appropriate staff member within their department. This thereby allows managers to only assign task when needed, which allows them to spend more time on other responsibilities they have to attend to such as monitor the performance of their staff via the dashboard.

12. **Update status**

    The assigned staff member of a specific task will have the ability to update the status of the issue as it progresses.

13. **Resolve and close request**

    The assigned staff member will be able to resolve and close the request. Management is able to revert this closer if deemed the issue is not yet resolved.

14. **Management dashboard and reporting**

    Management will be able to view information to open, overdue, resolved and closed requests. Management will be able to analyse request information using the relevant search and filter tools available.

15. **Digital platform Mobile accessibility**

    For our proposed digital platform, some of the screens we will adapt for mobile as this will improve the user experience for the requesters.

16. **Operator-assisted request capture (Added during M3)**

    For users unable to use CivicConnect for whatever reason, the option to call an operator or to capture a request via other channels such as email or WhatsApp. Operators can now create requests on behalf of citizens.

17. **Request Editing (Added during M3)**

    Requesters can edit their submitted request (title, description, category, location, priority) and add/remove image attachments while the request is still in 'Submitted' status.

18. **Citizen Search (Added during M3)**

    Requesters can search and filter their own past requests by text, reference number and status.

M3 Scope Status Note: The listed items remain the agreed scope baseline. Their implementation and deployment readiness are evaluated separately in Sections 13.4, 13.8–13.9 and the Release Evidence Summary. In particular, operator editing (Issue #122), hosted SMTP delivery (Issue #124), password recovery (Issue #123), and manager export (Issue #121) remain incomplete or constrained. The existence of a user-interface control does not constitute verified completion.

### 2.1.2 Out of Scope

These are explicit decisions that that we will not be moving forward with and are excluded from the baseline scope.

1. **AI chatbot**

   We will not create an AI chatbot for users to communicate with. It is unlikely that users will make use of this feature. Also, when implementing something like this it can be complex there are certain risks such as people misusing the chatbot for personal reasons (Schuman, 2026). There are security and implementation risks associated that are not worth the potential value that it could add (Schuman, 2026).

2. **Internal real time messaging system**

   Requesters won't have direct communication with staff via the system. Staff will send an email or call the user only when the issue on the request is not clearly stated. The system will have the option to update the status of the issues. However the staff do have the option to leave comments to the users to update them on the issues. The comment feature is different from real time communication as the requester can not repond to the comment, the comment is merely there to inform the requester of any information relating to the update of their request.

3. **Video file upload**

   Requesters will not be able to attach video files to the service requests. Uploads will be restricted to images only due to storage limitations (images will take less space to store).

4. **Voice input**

   Communication is limited to text only. Dealing with different audio files can get complex and also require a more data storage capacity. This potential feature is not worth the additional storage capacity.

5. **Social media login**

   We will provide one method of registration and that is email along with a password. We will not be integrating Google login, Login via Facebook. This overcomplicates the issue and requires an additional API's that could change or break. This could add to the technical debt of the application.

### 2.1.3 Deferred Scope

These are recognised possible future things we could implement in future milestones, but we deliberately postpone these issues due to schedule, cost, risk or missing evidence.

1. **Auto assign issues to the same task**

   Ideally, it would be beneficial for the system to automatically group multiple requests to the same underlying issue. For example, a specific website that the community focused organization manages and is in charge of goes down. They might get multiple requests that the website is no longer accessible. So instead of dealing with each individual request we treat it as single issue. This could be advantageous, but this decision is differed as we would first like to implement the basic functionality first. This is a "nice to have".

2. **Portal for requesters to review their interactions with the staff**

   Adding a reviews portal where requesters could review their interaction with a specific staff member if they had one. This is also another "nice to have".