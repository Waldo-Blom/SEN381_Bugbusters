# Scope Baseline & Constraints

## Scope baseline

### In scope

These are the core features and things that are application will and must be able to do. These are the things that we are promising to ensure that our system will perform, this is the baseline scope and will be adjusted as the project progresses (note in the event that the scope is adjusted we will properly document these changes):

1. **User login, registration and authentication**

   Requesters will be able to register and log in to access account specific functionality. They will also be able to update their personal information and settings such as if they want receive email push notifications.

   This authentication will also help with staff and management functionality as they will also have accounts. This will help with things such as staff being assigned to a specific department and also to a specific management person.

2. **Requesters submit a new service request**

   Requesters will be able to submit a new service request containing all the required information

3. **Add images to a request**

   Requesters will also be able to attach images to a specific request in the event that it is needed. However, images will be limited to a certain file size (still to be determined at a later stage what this established limitation is, as it depends on the database architecture limitations and free teer availability)

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

### Out scope

These are explicit decisions that that we will not be moving forward with and are excluded from the baseline scope.

1. **AI chatbot**

    We will not create an AI chatbot for users to communicate with. 
    It is unlikely that users will make use of this feature. Also, when implementing something like this it can be complex there are certain risks such as people misusing the chatbot for personal reasons. There are security and implementation risks associated that are not worth the potential value that it could add.


2. **Internal real time messaging system**

   Requesters won't have direct communication with staff via the system. Staff will send an email or call the user only when the issue on the request is not clearly stated. The system will have the option to update the status of the issues.

3. **Video file upload**

   Requesters will not be able to attach video files to the service requests. Uploads will be restricted to images only due to storage limitations (images will take less space to store).

4. **Voice input**

   Communication is limited to text only. Dealing with different audio files can get complex and also require a more data storage capacity. This potential feature is not worth the additional storage capacity.

5. **Social media login**

   We will provide one method of registration and that is email along with a password. We will not be integrating Google login, Login via Facebook. This overcomplicates the issues and requires additional API's that could change or break. This could add to the technical debt of the application.

### Deferred scope

These are recognised possible future things we could implement in future milestones, but we deliberately postpone these issues due to schedule, cost, risk or missing evidence.

1. **Auto assign issues to the same task**

   Ideally it would be beneficial for the system to automatically group multiple requests to the same underlying issue. For example, a specific website that the community focused organization manages and is in charge of. They might get multiple requests that the website

2. **Portal for requesters to review their interactions with the staff**

   Adding a reviews portal where requesters could review their interaction with a specific staff member if they had one.

3. **Additional role for across all management departments**

   An additional user role that will have access to a dashboard to view overall metrics of the system such as how many tasks assigned to what department, how long on average does each department take to resolve specific issues. It would give metrics about the performance of the service staff and management overall at a glance (Like an Admin user). So, this is not department specific but a user that has a greater level of access. We defer this decision as we would first like to establish a baseline system and then if there is available time for this feature we will implement it

4. **Extent of the Mobile adaptability**

   For our proposed digital platform, we would like to have a mobile adaptability for the requesters. But we don't yet know if we want to apply this same mobile adaptability for the Managers or Staff. Further investigation into their needs is required and also a deeper understanding of what needs to be displayed on the screens is required. For example, the management dashboard will most likely not be made responsive on a mobile screen as this is something that won't be easily achievable.