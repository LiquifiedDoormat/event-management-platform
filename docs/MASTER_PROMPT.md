# MASTER PROJECT PROMPT — EVENT MANAGEMENT & LIVE BUS TRACKING WEB APPLICATION

> **About this file.** This is the canonical, unmodified master prompt for this project, stored in the repository so any AI assistant or developer can resume work without it being pasted again. Only Markdown formatting (headings, lists, a code block for the folder tree) has been added. Do not change the requirements here without the project owner's approval. Current development state lives in [`PROJECT_MEMORY.md`](../PROJECT_MEMORY.md).

## 1. YOUR ROLE

Act as a senior full-stack engineer, software architect, database engineer, UI/UX designer, security engineer, and DevOps engineer.

Build a complete, production-oriented, mobile-first event management web application. The application will manage hotels, hotel coordinators, buses, and people attending an event.

I have limited AI coding credits. Therefore:

* Prioritize getting a functional application running as quickly as reasonably possible.
* Use established libraries, managed services, and straightforward solutions instead of unnecessary custom infrastructure.
* Avoid overengineering, unnecessary abstractions, excessive explanation, and repeated code.
* Generate complete, usable files rather than disconnected snippets.
* Maintain a consistent architecture throughout the project.
* Do not repeatedly regenerate files that already work.
* Keep documentation accurate and update it whenever relevant code or configuration changes.
* Make the code easy for another AI coding assistant or developer to understand and modify later.
* Never claim a feature works unless it has been implemented and, where feasible, tested.
* Work in coherent implementation stages, prioritizing the essential end-to-end functionality.
* When using an AI coding environment with repository access, directly create and edit files rather than unnecessarily printing entire files into the conversation.
* If repository access is unavailable, provide complete file contents and explicit paths in manageable batches.
* Never assume that an external service, deployment, GitHub push, or database operation succeeded without verification.

Do not build a disposable prototype that must be rewritten for production. Build a simple, maintainable foundation with secure access control and a realistic path to scaling.

## 1A. MANDATORY AI MEMORY LOG AND PROJECT HANDOVER SYSTEM

This project must remain fully resumable across AI assistants, conversations, and exhausted usage credits.

I may run out of credits in the middle of development and continue using a completely different AI assistant. I must be able to continue the project by opening the same GitHub repository, pasting the exact same master prompt, and providing the latest project memory log, without rewriting the prompt or explaining the entire project again.

Treat the memory log as a core project deliverable, not optional documentation.

### A. Create a permanent project memory file

Create this file in the repository root:

`PROJECT_MEMORY.md`

This is the canonical handover document for all AI assistants working on the project.

It must contain the following sections:

1. Project Overview
   * Application purpose and primary requirements.
   * Target users and account types.
   * Technology stack and architectural decisions.
2. Current Project Status
   * What has been completed.
   * What is partially implemented.
   * What has not been started.
   * What is currently broken or blocked.
   * Overall development stage.
3. Repository Structure
   * Current folder and file structure.
   * Purpose of important files.
   * Locations of authentication, authorization, database, API, GPS, realtime, UI, and translation logic.
4. Architecture and Data Model
   * Main database entities, fields, relationships, and constraints.
   * Role and permission rules.
   * Important API endpoints and their expected behavior.
   * Authentication and session architecture.
   * GPS and realtime data flow.
   * Important architectural decisions and why they were made.
5. Completed Features
   * List each implemented feature.
   * Record whether it has been tested and how.
   * Clearly distinguish implemented features from mocked, simulated, or unverified features.
6. Outstanding Tasks
   * Maintain a prioritized checklist of remaining tasks.
   * Mark tasks as completed, in progress, blocked, or not started.
   * Identify dependencies between tasks.
7. Current Development State
   * The last successfully completed task.
   * The exact task currently in progress.
   * The next recommended task.
   * Any incomplete changes that must be finished before proceeding.
   * Any relevant build, lint, type-check, migration, or test failures.
8. Setup and Execution
   * Required software and runtime versions.
   * Installation commands.
   * Environment variable names and where to obtain their values.
   * Database setup and migration commands.
   * Development server and test commands.
   * Deployment instructions and known configuration requirements.
9. Environment and External Services
   * Authentication provider and integration status.
   * Database and realtime provider details.
   * Google Maps configuration status.
   * Required external service accounts and setup steps.
   * Never include secret values, API credentials, passwords, OTPs, or private keys.
10. Known Issues and Risks
    * Bugs, unresolved decisions, technical limitations, and security concerns.
    * Performance considerations and outstanding scalability tests.
11. Change History
    * A chronological, concise record of significant changes.
    * Files created, modified, or removed.
    * Database schema or migration changes.
    * Dependencies added or removed.
    * Important decisions and reasons.
12. Instructions for the Next AI
    * Exact steps to resume work.
    * Files to inspect first.
    * Commands to run to verify the existing state.
    * Important constraints that must not be violated.
    * The next concrete action to take.

### B. Update the memory log continuously

Update `PROJECT_MEMORY.md` throughout development, not merely at the end of a session.

After completing each meaningful implementation task:

1. Update the relevant completion checklist.
2. Record important files changed and the purpose of each change.
3. Record any schema, migration, dependency, API, or architectural changes.
4. Record tests actually performed and their real outcomes.
5. Update known issues and the next recommended task.
6. Ensure the documented repository structure matches the actual repository.

Before ending a response, switching tasks, or reaching a context or usage limit, update the log with the most accurate state available.

If a task is interrupted midway, record exactly what is unfinished and how to continue safely.

Do not mark a feature complete just because its code was generated. Record it as verified only after the relevant checks have actually passed.

### C. Make handover independent of the current AI

The project must never depend on hidden conversation history or an individual AI assistant's memory.

* Store all durable project knowledge in the GitHub repository.
* Keep the master prompt reusable without modification.
* Make `PROJECT_MEMORY.md` self-contained enough for a new AI to understand the project.
* Keep the README focused on installation, configuration, usage, and deployment.
* Use the memory log for development state, implementation details, decisions, and handover.
* If a separate conversation-specific summary is useful, generate it as an additional file named `HANDOVER.md`. Do not replace or duplicate the canonical memory log unnecessarily.
* Do not require the next AI to ask me to explain information already documented in the repository.
* On resumption, inspect the master prompt, `PROJECT_MEMORY.md`, `README.md`, and actual repository state before making changes.
* Compare the documented state against the actual code and Git history. The repository's verified state takes precedence over outdated documentation.
* If the memory log is missing or stale, reconstruct and update it before continuing.
* If the repository is unavailable, ask me to provide the latest memory log and the relevant project files instead of inventing the current state.

At the end of every implementation session, provide a concise handover containing:

1. What was completed.
2. What was tested and what passed or failed.
3. What remains incomplete.
4. The next recommended action.
5. Confirmation that `PROJECT_MEMORY.md` was updated, or an explicit explanation if it could not be updated.

## 2. PROJECT OBJECTIVE

Build an event management platform with three account types:

1. Owner: Has complete access to all application data and can edit all assignments, records, and system configurations.
2. Admin: An event administrator or coordinator who can view and manage all four main categories of information.
3. Customer: An attendee who can view only their own information and information connected to their allotted hotel.

The four main entities are:

* Hotels
* Hotel Coordinators
* Buses
* People (event attendees and administrative users where applicable)

The relationships are:

* Every hotel has one designated hotel coordinator.
* Every bus is assigned to a hotel.
* Every attendee is assigned to a hotel.
* A hotel may have multiple buses and multiple attendees.
* Customers can view the coordinator, hotel, and buses associated with their allotted hotel.
* A coordinator can control the live tracking and status of the bus they are assigned to accompany.
* The Owner can change hotel assignments, bus assignments, coordinator assignments, and account roles where authorized.

Use relational database constraints and server-side authorization to enforce these relationships.

Do not treat frontend visibility restrictions as a security mechanism.

## 3. REQUIRED TECHNOLOGY STACK

Use the following stack unless a concrete compatibility issue makes a change necessary. Explain any proposed change before implementing it.

### Frontend

* Next.js using the App Router.
* TypeScript with strict type checking.
* Tailwind CSS.
* A lightweight, accessible component library such as shadcn/ui where useful.
* React Hook Form and Zod for form handling and validation where appropriate.
* next-intl or another established internationalization library for English and Hindi.

### Backend

* Next.js server-side Route Handlers or Server Actions where appropriate.
* A clear separation between presentation, business logic, data access, and authorization.
* Zod validation for all relevant untrusted inputs.
* Secure server-side authentication and role-based access control.

### Database

* PostgreSQL.
* Prisma ORM.
* Version-controlled database migrations.
* Foreign keys, indexes, uniqueness constraints, and transactions where appropriate.

### Authentication

* Phone OTP authentication using an established provider that supports Indian phone numbers.
* OTP verification for each new login session.
* Persistent secure sessions so a user does not need to log in every time they reopen the website.
* Do not implement a custom OTP-generation and delivery system unless absolutely necessary.

### Maps and GPS

* Google Maps Platform for maps and geographic visualization.
* Browser Geolocation API on the assigned coordinator's phone for live bus tracking.
* A managed realtime service or another proven solution for distributing location updates.
* Use a provider abstraction where practical so the realtime service can be replaced without rewriting the entire application.

### Deployment and repository

* GitHub repository.
* Vercel-compatible application deployment.
* Managed PostgreSQL and managed realtime infrastructure.
* Environment variables for all credentials and environment-specific settings.
* Automated checks using GitHub Actions.

Keep dependencies to the minimum necessary.

## 4. THREE ACCOUNT TYPES AND PERMISSIONS

Implement the following authorization rules on the server.

### A. OWNER

The Owner has complete administrative access.

The Owner can:

* View, create, edit, and deactivate hotels.
* Create, edit, deactivate, and assign hotel coordinators.
* Create, edit, deactivate, and assign buses.
* View, create, edit, deactivate, and reassign attendees.
* Change an attendee's allotted hotel.
* Change a hotel's designated coordinator.
* Change a bus's assigned hotel.
* Manage user accounts and roles.
* Review bus locations and statuses across all hotels.
* View relevant audit logs.
* Configure event-wide settings.

Protect Owner accounts and privileged actions carefully. Do not allow an ordinary Admin to promote themselves or another account to Owner.

Create the initial Owner through a documented, secure bootstrap procedure. Do not make a public registration option for Owner accounts.

### B. ADMIN

Admins can view and manage information across all hotels, coordinators, buses, and attendees.

Admins can:

* View the complete event directory.
* View individual detail pages for all four entity types.
* Create and update operational records, subject to explicit permission rules.
* Monitor bus locations and statuses.
* Search, filter, and sort records.
* View attendance and transport information.

Admins must not be able to change Owner privileges or perform Owner-exclusive reassignment and system configuration actions.

Do not silently give every Admin unrestricted deletion privileges. Define which records Admins may create, edit, deactivate, or delete.

### C. CUSTOMER

Customers are attendees.

Customers can:

* View their own profile and event information.
* View their allotted hotel, address, and map location.
* View their hotel's coordinator information and available contact details.
* View all buses assigned to their hotel.
* View bus stops and route information configured for those buses.
* View bus status and authorized live location information.
* Switch between English and Hindi.
* Update only explicitly permitted personal information.

Customers must never be able to access another attendee's private information, unrelated hotels, unrelated coordinators, or buses assigned to other hotels.

If a customer's hotel assignment changes, access to the old hotel's protected information must end and access to the new hotel's information must begin immediately, without requiring the customer to create a new account.

## 5. PHONE OTP AUTHENTICATION AND SESSIONS

Every user account is associated with a phone number.

Implement this flow:

1. User enters their phone number.
2. The system validates and normalizes the phone number.
3. The authentication provider sends an OTP.
4. The user enters the OTP.
5. The server verifies the OTP through the provider.
6. The server establishes an authenticated session and resolves the user's current account and role.
7. The user is redirected to the appropriate homepage.

Requirements:

* Do not require OTP verification every time a user reopens the website.
* Use secure, persistent sessions with appropriate expiry and revocation.
* Prefer secure, HttpOnly, SameSite cookies.
* Apply appropriate CSRF protections wherever relevant.
* Rate-limit OTP requests, verification attempts, and sensitive authentication endpoints.
* Prevent phone-number enumeration through generic responses.
* Never store OTPs or authentication secrets in plaintext.
* Do not put session secrets in localStorage.
* Support sign-out and session invalidation.
* Provide clear messages for expired OTPs, failed verification, and network errors.
* Provide an appropriate recovery path if the authentication provider is temporarily unavailable.
* Use the phone number as a login identifier, not as proof that a user is authorized to register for the event.
* Do not permit unrestricted public creation of privileged accounts.
* Account provisioning must be controlled by an authorized administrative process.

Document the selected authentication provider, setup steps, pricing considerations, and required environment variables.

## 6. MOBILE-FIRST UI/UX DESIGN

The primary users will access this website from mobile phones. Some users will be elderly or unfamiliar with complicated applications.

Design for clarity, visibility, and ease of use rather than visual complexity.

### Design principles

* Mobile-first responsive layouts.
* Large, clearly labelled buttons.
* Readable typography.
* Strong text/background contrast.
* Simple navigation with a small number of primary actions.
* Adequate spacing between interactive elements.
* Clear loading, empty, success, and error states.
* Avoid clutter, unnecessary animations, excessive cards, and tiny icons.
* Use icons alongside text, never icons alone for important actions.
* Confirm destructive actions before proceeding.
* Use accessible forms and helpful validation messages.
* Ensure layouts work on common Android phones, iPhones, tablets, and desktop browsers.
* Follow WCAG accessibility principles, including keyboard navigation and screen-reader labels.
* Prefer a minimum touch target of approximately 44 × 44 CSS pixels, with larger targets for important actions.

Use a consistent visual design system with a restrained colour palette. Use colour to reinforce meaning, not as the only way to communicate status.

### Navigation

Use a simple mobile navigation pattern, such as a small bottom navigation bar or a clear menu with a persistent way to return home.

Avoid presenting every administrative feature simultaneously on small screens.

Use tables only where genuinely useful on desktop. On mobile, convert dense records into readable lists or cards with clear details and actions.

Include loading indicators and empty-state messages instead of blank screens.

### English and Hindi

Provide complete English and Hindi translations.

Requirements:

* Add a visible language selector.
* Preserve the selected language when the user navigates or returns.
* Translate navigation, buttons, forms, validation messages, statuses, notifications, errors, and essential system instructions.
* Use proper Unicode Hindi text.
* Use a font stack that renders both languages correctly.
* Do not mix languages randomly within the interface.
* Do not rely on automatically translating the entire interface at runtime.
* Keep translations in organized locale files.
* Ensure translated text fits on mobile screens without clipping.

Default to English unless a different default is configured.

## 7. DIFFERENT HOMEPAGES FOR EACH ACCOUNT TYPE

Create distinct dashboards for Owner, Admin, and Customer.

### Owner homepage

Show:

* Total hotels.
* Total buses.
* Total attendees.
* Total coordinators.
* Active buses and current bus statuses.
* A searchable overview of event records.
* Quick actions for creating and editing records.
* Assignment management.
* A way to identify missing or inconsistent assignments.
* Relevant operational alerts.

The Owner should be able to navigate directly to every category and its individual records.

### Admin homepage

Show:

* Overview of the event.
* Hotel, coordinator, bus, and attendee directories.
* Active bus statuses.
* Live bus tracking across the event.
* Search and filters.
* Quick access to permitted operational actions.

### Customer homepage

Show only relevant information:

* Welcome message and the attendee's essential event details.
* Allotted hotel name and address.
* Hotel location on Google Maps.
* Hotel coordinator's name and contact details.
* Assigned buses.
* Bus stops and route information.
* Current bus status.
* Live bus location when available and authorized.
* A prominent indication of whether a bus is boarding, moving, or has reached its destination.

Prioritize the most time-sensitive transport information. Do not show irrelevant administrative statistics or unrelated attendees.

## 8. FOUR MAIN CATEGORIES AND DETAIL PAGES

Every category must have a directory/listing page and a separate detail page for each record.

### A. HOTELS

Each hotel should support:

* Unique ID.
* Hotel name.
* Address.
* Latitude and longitude.
* Google Maps location.
* Hotel coordinator assignment.
* Assigned buses.
* Optional event-specific notes.
* Created and updated timestamps.
* Active/inactive status.

Features:

* Search and filter hotels.
* View each hotel's detail page.
* Show the location on a map.
* Show the assigned coordinator.
* Show buses assigned to the hotel.
* Show attendee counts to authorized administrators.
* Edit hotel details according to role permissions.

### B. HOTEL COORDINATORS

Each coordinator should have:

* Associated user account.
* Name.
* Phone number.
* Assigned hotel.
* Assigned bus or current trip assignment, where applicable.
* Active/inactive status.
* Relevant operational details.

Features:

* View coordinator details.
* Contact the coordinator through their displayed phone number.
* Display their assigned hotel.
* Display their current transport assignment when authorized.

A coordinator may have a designated hotel and a separate active bus-trip assignment. Do not assume the coordinator must always be physically located at the hotel.

### C. BUSES

Each bus should support:

* Unique ID.
* Bus name, number, or registration identifier.
* Assigned hotel.
* Configurable bus stops and route information.
* Assigned coordinator or current trip coordinator.
* Current operational status.
* Latest latitude and longitude.
* Last location update timestamp.
* Location freshness indicator.
* Active/inactive status.

Features:

* View the bus's detail page.
* View its assigned hotel.
* View its designated coordinator.
* View its configured stops and route information.
* View the current status.
* Display its live location on Google Maps when available.
* Display the last update time.
* Indicate when location data is stale or unavailable.
* Restrict bus editing and status controls to authorized users.

Do not assume that a bus follows only one route forever. Store route and stop data in a maintainable way so they can be changed when necessary.

### D. PEOPLE

People include Customers, Admins, and hotel coordinators. The Owner must also be represented appropriately within account management.

Each person should have:

* Unique internal ID.
* Name.
* Phone number.
* Role.
* Hotel assignment where applicable.
* Account status.
* Created and updated timestamps.

Features:

* Search people by name, phone number, or ID.
* Filter by role, hotel, and account status.
* View each person's detail page according to permissions.
* Assign attendees to hotels.
* Change assignments through the Owner interface.
* Create or provision user accounts securely.
* Deactivate accounts without unnecessarily destroying historical records.

Do not expose every person's phone number to customers. Only display contact information that is explicitly permitted for their role and purpose.

Use pagination or cursor-based loading for large directories.

## 9. BUS STATUS MANAGEMENT

The coordinator accompanying the bus controls its operational status using large, clearly labelled controls.

Support these statuses:

1. Boarding
2. On the way to hotel
3. Reached hotel
4. On the way to bus stop
5. Reached bus stop

Store statuses as validated enum values or an equivalent constrained representation.

Requirements:

* Show statuses in both English and Hindi.
* Display a clear visual status indicator.
* Show when the status was last changed.
* Persist status updates in the database.
* Notify authorized connected customers of status changes through the realtime system.
* Validate every status change on the server.
* Verify that the coordinator is assigned to the relevant bus trip.
* Allow only authorized roles to change statuses.
* Log important status changes for operational accountability.
* Prevent accidental repeated submissions and stale updates where appropriate.
* Handle network failures without falsely reporting success.

Model a bus's current trip separately from its permanent bus record where necessary.

The system must allow a new trip to start without destroying the previous trip's history.

Define sensible transition rules, but support legitimate operational corrections. For example, an authorized coordinator may need to correct an accidentally selected status.

Do not hardcode a single route or a single trip into the application.

## 10. LIVE GPS TRACKING — HIGHEST PRIORITY

Live bus tracking is one of the most important features of this application.

The coordinator's phone will provide the bus's location while the coordinator accompanies the bus.

### A. Location collection

Use the browser Geolocation API.

Requirements:

* Request location permission explicitly.
* Start tracking only after the coordinator initiates an authorized active trip.
* Allow the coordinator to start and stop sharing.
* Clearly show whether tracking is active.
* Show permission errors and GPS availability.
* Record latitude, longitude, accuracy, and timestamp when available.
* Reject invalid coordinates.
* Authenticate location-update requests.
* Verify that the user is authorized to update the relevant bus trip.
* Do not allow customers or unrelated coordinators to submit location updates for another bus.
* Handle lost connectivity and reconnect safely.
* Stop tracking when the trip ends or sharing is stopped.
* Avoid unnecessary battery consumption.

Use an adjustable update interval and movement-aware throttling where appropriate. Start with a sensible configurable interval, such as approximately 5–10 seconds while moving, and validate the resulting accuracy, network cost, battery consumption, and system load.

Do not promise background tracking when the browser or operating system cannot reliably support it. Clearly document the limitations of mobile browsers, especially when a phone locks or the browser is suspended.

If reliable background tracking becomes a strict requirement, document the need for a dedicated mobile application or another supported approach rather than pretending that a normal website guarantees continuous GPS collection.

### B. Live location distribution

Use a managed realtime service or a scalable location distribution architecture.

Requirements:

* Broadcast only the latest necessary location information.
* Scope subscriptions by bus, hotel, or trip authorization.
* Ensure customers cannot subscribe to unrelated buses.
* Ensure Admins and the Owner can access the appropriate wider view.
* Authenticate subscriptions and enforce authorization on the server.
* Prevent stale or out-of-order updates from replacing newer locations.
* Include timestamps so clients can distinguish current locations from stale data.
* Provide a fallback to fetch the latest stored location if realtime delivery is interrupted.
* Avoid sending the full location history with every update.
* Disconnect unnecessary subscriptions when users leave the relevant screen.
* Do not create a separate database write or expensive fan-out operation for every individual viewer.

### C. Customer location display

Customers should see:

* The bus's latest location on Google Maps.
* The assigned bus identifier.
* Its current status.
* Its assigned hotel.
* Its configured stops and route information.
* The time of the last location update.
* Whether location sharing is active, unavailable, or stale.

Use a sensible configurable stale-location threshold.

Do not display an old position as though it were current. Never fabricate location coordinates or simulate successful GPS tracking in production.

### D. Data retention

Do not store unlimited GPS history by default.

Store the latest location separately from any optional trip history. Establish a configurable retention policy for historical coordinates and document the privacy implications.

Only retain detailed historical GPS information for as long as operationally necessary.

## 11. GOOGLE MAPS INTEGRATION

Use Google Maps Platform for:

* Hotel location markers.
* Live bus markers.
* Authorized multi-bus administrative maps.
* Configured bus stops and routes.
* Map navigation and basic geographic visualization.

Requirements:

* Restrict browser API keys by allowed origins and required APIs.
* Keep server-side secrets on the server.
* Use separate keys for browser and server use where appropriate.
* Do not expose unrestricted API keys in the repository.
* Avoid unnecessary map reloads and API calls.
* Use lazy loading for map-heavy pages where appropriate.
* Provide a readable address and location details even when maps fail.
* Display an informative error when a map cannot load.

Do not assume that drawing a line between points is equivalent to a real road route. Use appropriate routing services only where required and configured.

Document API setup, billing considerations, usage limits, and quota monitoring.

## 12. DATABASE DESIGN

Use PostgreSQL with Prisma ORM.

Design the database before implementing the full application.

Include appropriate models for at least:

* User
* Hotel
* Coordinator assignment or coordinator relationship
* Bus
* Bus stop
* Route or trip, as needed
* Bus trip assignment
* Current bus location
* Bus status history
* Session or provider-managed authentication references, where applicable
* Audit log
* Event configuration, if needed

Avoid unnecessary duplication of the same information across tables.

Define relationships, uniqueness constraints, indexes, and deletion behavior carefully.

Requirements:

* Use stable internal IDs.
* Normalize phone numbers.
* Ensure phone-number uniqueness where appropriate.
* Use foreign keys for relationships.
* Index frequently queried columns.
* Index common access paths such as hotel assignment, bus assignment, role, active trip, and relevant timestamps.
* Use transactions for multi-record assignment changes.
* Protect against orphaned records and inconsistent assignments.
* Prefer deactivation or soft deletion where historical records must remain intact.
* Include `createdAt` and `updatedAt` fields where useful.
* Add appropriate database constraints for valid statuses and assignments.
* Use pagination for large datasets.
* Avoid unbounded database queries.
* Do not load all 16,000 users into a browser at once.

### Migration policy

* Store every database migration in Git.
* Use development migration commands during development.
* Use appropriate production migration commands during deployment.
* Never rely on automatically resetting or recreating the production database.
* Never destroy production data to fix a schema problem.
* Document migration order and recovery considerations.

Seed scripts must be safe and repeatable.

Use fake demonstration data only in development and tests. Never silently populate production with sample attendees.

## 13. ACCESS CONTROL AND DATA SECURITY

Security is mandatory.

Implement server-side role-based access control and relationship-based authorization.

Every protected operation must validate:

1. Whether the requester has an authenticated session.
2. Whether their account is active.
3. Whether their role permits the operation.
4. Whether the requested resource is within their authorized scope.
5. Whether the supplied data is valid.

Examples:

* A customer cannot retrieve another customer's profile by changing an ID in a URL.
* A customer cannot retrieve another hotel's bus data by changing an API parameter.
* A coordinator cannot update a bus they are not authorized to operate.
* An Admin cannot promote themselves to Owner.
* Only the Owner can perform Owner-exclusive reassignment operations.
* A deactivated user must lose access according to the defined session revocation policy.

Implement:

* Input validation.
* Safe error handling.
* Rate limiting.
* Authentication and authorization checks.
* Secure session management.
* Appropriate CSRF protection.
* Protection against SQL injection through parameterized ORM operations.
* XSS prevention through safe rendering and validation.
* Secure HTTP headers.
* Appropriate CORS configuration.
* Secret management.
* Audit logging for sensitive administrative actions.
* Data minimization and appropriate personal data retention.

Never rely on hidden buttons, client-side route protection, or frontend filters to enforce permissions.

Avoid logging OTPs, access tokens, session secrets, or unnecessary personal data.

Use production-safe error messages without exposing stack traces, database details, or secrets.

## 14. SCALABILITY AND PERFORMANCE

The application is expected to support:

* More than 16,000 registered users.
* At least 2,000 active users at the same time.
* Concurrent customer map views.
* Multiple buses transmitting location updates.
* Realtime status changes and location broadcasts.
* Administrative searches and updates.

Design for this target, but do not claim it has been achieved without appropriate testing.

Requirements:

* Use server-side pagination.
* Add indexes for frequent database queries.
* Avoid N+1 query patterns.
* Select only the fields required for each response.
* Use database connection pooling appropriate to the deployment environment.
* Avoid creating unnecessary database connections per request.
* Cache only data that is safe to cache and can tolerate the defined freshness interval.
* Invalidate or refresh cached assignments when they change.
* Do not publicly cache private user or hotel-specific responses.
* Keep realtime payloads small.
* Avoid polling at very short intervals when realtime subscriptions are available.
* Use batching or throttling where appropriate.
* Separate frequently changing GPS data from relatively static hotel information.
* Prevent excessive database writes from unnecessary GPS updates.
* Handle reconnects and transient provider failures.
* Use timeouts and bounded retries with backoff.
* Prevent runaway retries and uncontrolled concurrent requests.
* Use structured logs and basic error monitoring.
* Keep the application stateless where possible so web instances can scale horizontally.

Design the GPS/realtime architecture so that its processing and distribution can scale independently of ordinary application requests if necessary.

### Load testing

Create a practical load-testing plan and scripts using an established tool such as k6.

Test representative workloads, including:

* Concurrent login/session validation.
* Customer dashboard requests.
* Hotel and bus detail requests.
* Administrative searches.
* GPS location updates.
* Realtime subscriptions and broadcasts.
* Status changes.

Define measurable performance targets for response times, error rates, and realtime update latency.

Run tests only against a safe test environment. Do not load-test production without explicit authorization.

Record the actual results in the documentation and `PROJECT_MEMORY.md`.

If the available environment cannot run load tests, provide the scripts, commands, and outstanding verification steps.

## 15. STANDARD REPOSITORY AND FOLDER STRUCTURE

Use a clean, conventional, GitHub-friendly repository structure. Adjust only when a genuine implementation need requires it, and document any significant deviation.

A suggested structure is:

```
event-management-platform/
├── .github/
│ └── workflows/
│ └── ci.yml
├── prisma/
│ ├── schema.prisma
│ ├── migrations/
│ └── seed.ts
├── public/
│ ├── icons/
│ └── images/
├── messages/
│ ├── en.json
│ └── hi.json
├── src/
│ ├── app/
│ │ ├── [locale]/
│ │ │ ├── (auth)/
│ │ │ │ └── login/
│ │ │ ├── (owner)/
│ │ │ │ └── owner/
│ │ │ ├── (admin)/
│ │ │ │ └── admin/
│ │ │ ├── (customer)/
│ │ │ │ └── customer/
│ │ │ ├── hotels/
│ │ │ ├── coordinators/
│ │ │ ├── buses/
│ │ │ ├── people/
│ │ │ └── layout.tsx
│ │ ├── api/
│ │ │ ├── auth/
│ │ │ ├── hotels/
│ │ │ ├── coordinators/
│ │ │ ├── buses/
│ │ │ ├── people/
│ │ │ ├── trips/
│ │ │ └── locations/
│ │ ├── globals.css
│ │ └── layout.tsx
│ ├── components/
│ │ ├── ui/
│ │ ├── layout/
│ │ ├── maps/
│ │ ├── hotels/
│ │ ├── buses/
│ │ ├── coordinators/
│ │ └── people/
│ ├── features/
│ │ ├── auth/
│ │ ├── hotels/
│ │ ├── coordinators/
│ │ ├── buses/
│ │ ├── people/
│ │ └── trips/
│ ├── lib/
│ │ ├── auth/
│ │ ├── authorization/
│ │ ├── db/
│ │ ├── validation/
│ │ ├── maps/
│ │ ├── realtime/
│ │ ├── rate-limit/
│ │ ├── logging/
│ │ └── utils/
│ ├── server/
│ │ ├── services/
│ │ ├── repositories/
│ │ └── policies/
│ ├── hooks/
│ ├── types/
│ ├── config/
│ └── i18n/
├── tests/
│ ├── unit/
│ ├── integration/
│ ├── e2e/
│ └── load/
├── scripts/
├── docs/
│ ├── ARCHITECTURE.md
│ ├── SECURITY.md
│ ├── DEPLOYMENT.md
│ ├── DATABASE.md
│ └── OPERATIONS.md
├── .env.example
├── .gitignore
├── .npmrc
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── package-lock.json
├── tsconfig.json
├── README.md
├── PROJECT_MEMORY.md
└── HANDOVER.md
```

This is a reference structure, not a requirement to create empty directories or unnecessary files. Create files when needed, and keep the project simple.

Use the package manager selected at initialization consistently. If npm is selected, commit `package-lock.json` and do not mix npm with other package managers.

### Architecture conventions

* Keep UI components focused on presentation and interaction.
* Put business logic in reusable server-side services.
* Centralize authentication and authorization helpers.
* Centralize database access patterns where doing so improves consistency.
* Keep validation schemas reusable.
* Keep English and Hindi translations separate from application logic.
* Keep external service integrations behind clear interfaces.
* Avoid duplicated business logic across API endpoints.
* Avoid circular dependencies.
* Use consistent naming conventions.
* Do not create an enormous single component or a single file containing the entire application.

## 16. GITHUB AND VERSION CONTROL

The entire project must be suitable for long-term maintenance through GitHub.

Requirements:

* Use a conventional repository structure.
* Initialize Git if it has not already been initialized.
* Create a useful `.gitignore`.
* Never commit `.env`, credentials, private keys, access tokens, or production data.
* Provide `.env.example` with variable names and safe placeholder descriptions.
* Commit database migrations.
* Keep `README.md`, `PROJECT_MEMORY.md`, and architecture documentation synchronized with significant changes.
* Use descriptive commit messages.
* Prefer small, logical commits.
* Do not overwrite unrelated user changes.
* Inspect `git status` before modifying existing work.
* Do not perform destructive Git operations without explicit authorization.
* Do not force-push or rewrite shared history without explicit authorization.
* Do not claim that changes have been pushed to GitHub unless the push was actually performed and verified.

If GitHub integration or terminal access is available, use it directly when authorized.

If GitHub access is unavailable, prepare the repository and provide the exact commands needed to publish it.

Recommended commit sequence:

1. Initial project setup.
2. Database schema and migrations.
3. Authentication and authorization.
4. Core entities and administration.
5. Customer dashboard.
6. GPS and realtime functionality.
7. Internationalization and accessibility.
8. Testing and deployment configuration.

Adapt these commits to the actual work rather than generating empty commits.

## 17. ENVIRONMENT CONFIGURATION

Create `.env.example` listing every required environment variable.

Potential variables include:

* `DATABASE_URL`
* Authentication provider configuration.
* Phone OTP provider credentials.
* Google Maps browser API key.
* Google Maps server-side credentials, if required.
* Realtime provider credentials.
* Session or application secrets, if required by the chosen architecture.
* Application base URL.
* Logging and monitoring configuration.

Use the actual variable names required by the selected libraries.

Never place actual secret values in `.env.example`.

Do not hardcode secrets into source files.

Do not assume API keys, authentication accounts, paid services, or database instances already exist.

If a third-party integration requires manual setup, implement the integration as far as possible and provide precise setup instructions.

Use separate development and production configurations.

Validate required environment variables at startup and provide clear, safe configuration errors.

## 18. TESTING REQUIREMENTS

Implement meaningful automated tests using suitable tools.

At minimum, cover:

### Authentication

* Successful OTP verification.
* Invalid or expired OTP handling through the supported provider/test setup.
* Session persistence.
* Sign-out.
* Inactive account access.
* Unauthorized role access.

### Authorization

* Customer cannot access another attendee.
* Customer cannot access another hotel's private resources.
* Customer cannot access unrelated buses.
* Coordinator cannot update an unassigned bus.
* Admin cannot perform Owner-exclusive operations.
* Owner can perform authorized reassignment operations.

### Core functionality

* Hotel creation and editing.
* Coordinator assignment.
* Bus assignment.
* Attendee hotel assignment.
* Bus trip creation and status changes.
* GPS update validation.
* Realtime authorization.
* English and Hindi rendering.

### Reliability

* Invalid inputs.
* Database failures.
* Realtime disconnection.
* Stale location updates.
* Concurrent assignment changes.
* Appropriate loading and error states.

Use unit tests, integration tests, and a small number of end-to-end tests.

Use mocked providers for automated tests where appropriate, but never mistake mocked functionality for a verified production integration.

Before considering a major feature complete, run the relevant tests and record their actual results.

## 19. ERROR HANDLING AND MONITORING

Provide predictable and user-friendly error handling.

Requirements:

* Use consistent API response structures.
* Validate inputs before database operations.
* Handle missing records.
* Handle expired sessions.
* Handle authorization failures.
* Handle database and realtime service outages.
* Handle GPS permission denial and location timeouts.
* Handle map loading failures.
* Prevent duplicate form submissions.
* Show appropriate success and failure messages.
* Log errors with useful context while protecting personal information.
* Avoid returning internal exception details to users.

Include basic health monitoring where appropriate.

Document how to investigate failed deployments, database errors, authentication failures, and realtime tracking issues.

## 20. README AND DEVELOPER DOCUMENTATION

Create a complete `README.md` that allows a new developer or AI assistant to set up the project.

Include:

* Project overview.
* Main features.
* Technology stack.
* Prerequisites.
* Installation instructions.
* Environment variable setup.
* Database creation and migration.
* Authentication provider configuration.
* Google Maps configuration.
* Realtime provider configuration.
* Development commands.
* Test commands.
* Build and production commands.
* GitHub workflow.
* Deployment instructions.
* Common problems and solutions.
* Security considerations.
* Current feature limitations.

Also maintain the following documents where relevant:

* `docs/ARCHITECTURE.md`
* `docs/SECURITY.md`
* `docs/DEPLOYMENT.md`
* `docs/DATABASE.md`
* `docs/OPERATIONS.md`

Do not copy the entire README into every document. Give each file a clear purpose.

Keep `PROJECT_MEMORY.md` focused on development state and AI handover, rather than duplicating every section of the README.

## 21. DEVELOPMENT STRATEGY — CONSERVE CREDITS

Do not attempt to generate every file and implement every feature in one enormous response.

Work in the following phases.

### Phase 1: Foundation

* Inspect the existing repository, if any.
* Establish the technology stack and package manager.
* Create the project structure.
* Configure TypeScript, linting, formatting where useful, and basic testing.
* Create `.env.example`.
* Create `README.md`.
* Create `PROJECT_MEMORY.md`.
* Establish the initial database schema.
* Confirm that the application starts.

### Phase 2: Database and authentication

* Implement the core data models.
* Add migrations.
* Configure phone OTP authentication.
* Implement persistent sessions and sign-out.
* Implement role and relationship-based authorization.
* Establish a secure Owner bootstrap process.
* Add tests for access control.

### Phase 3: Core administration

* Implement hotels.
* Implement coordinators.
* Implement buses.
* Implement people and attendee assignments.
* Build searchable directories and detail pages.
* Build Owner and Admin dashboards.
* Add assignment management.

### Phase 4: Customer experience

* Build the Customer homepage.
* Implement hotel details and map display.
* Display the coordinator and authorized contact information.
* Display assigned buses, stops, and status.
* Verify that customer access is restricted to the correct hotel and related resources.

### Phase 5: GPS and realtime

* Implement bus trips and trip assignments.
* Implement coordinator-controlled GPS sharing.
* Implement authorized location updates.
* Implement realtime distribution.
* Implement customer map tracking.
* Implement status broadcasts.
* Implement stale-location detection and reconnection handling.

### Phase 6: Bilingual UI and accessibility

* Complete English and Hindi translations.
* Polish mobile navigation.
* Improve accessibility.
* Verify all three dashboards on mobile and desktop.
* Test common Android and iPhone browser limitations where feasible.

### Phase 7: Verification and deployment

* Run linting, type checking, tests, and production builds.
* Resolve critical failures.
* Configure deployment.
* Run database migrations safely.
* Verify required external services.
* Perform a basic production smoke test.
* Prepare load-testing scripts and document actual performance results.
* Update all documentation and the project memory log.

### Implementation rules

* Work on the smallest coherent feature that moves the project forward.
* Prefer completing one vertical slice, such as authentication or hotel management, over creating many unfinished files.
* Keep the application runnable at meaningful milestones.
* Reuse existing components and services.
* Avoid adding dependencies unless they solve a real requirement.
* Do not introduce microservices unless a demonstrated technical need justifies them.
* Do not postpone access control until after the UI is complete.
* Do not claim live GPS works until real authorized location updates have been tested.
* Do not claim OTP works until the provider integration has been verified.
* If a provider account or secret is unavailable, implement the integration safely, clearly document what is missing, and continue with independent tasks.
* Do not spend credits repeatedly explaining the architecture once it has been documented.
* Do not ask for information already present in the repository or memory log.

## 22. REQUIRED ACCEPTANCE CRITERIA

The application is not considered ready for its initial production release until the relevant critical criteria below have been met.

### Authentication and permissions

* Users can authenticate with phone OTP.
* Sessions persist appropriately across browser restarts.
* Sign-out works.
* Owner, Admin, and Customer permissions are enforced server-side.
* Customers cannot access unrelated attendee, hotel, coordinator, or bus data.
* Owner-only reassignment controls work securely.

### Core functionality

* Hotels, coordinators, buses, and people have usable directory and detail pages.
* Relationships are enforced consistently.
* Attendees can be assigned to hotels.
* Buses can be assigned to hotels.
* Coordinators can be assigned to hotels and authorized trips.
* Changes are persisted in PostgreSQL.

### Transport

* Authorized coordinators can start and stop tracking.
* Location updates are validated and associated with the correct active trip.
* Authorized customers can see the correct bus's latest location.
* Bus status updates persist and reach authorized connected users.
* Stale or unavailable locations are clearly identified.
* Tracking limitations are documented honestly.

### Interface

* Each role has an appropriate homepage.
* English and Hindi are available throughout the essential application flows.
* The interface is usable on mobile devices.
* Important actions have sufficiently large controls and readable labels.
* Loading, error, and empty states are implemented.

### Reliability and maintainability

* The application builds successfully.
* Critical automated tests pass.
* Database migrations are reproducible.
* Secrets are excluded from Git.
* Setup and deployment documentation is usable.
* `PROJECT_MEMORY.md` accurately reflects the actual project.
* Load testing has been performed or its outstanding status and execution instructions are explicitly documented.

### Performance

* The architecture has been evaluated against the expected 16,000+ registered users and 2,000+ concurrently active users.
* Representative load tests have measured response times, error rates, database behavior, and realtime performance.
* Any unmet targets and required infrastructure changes are documented.

Do not claim production readiness if critical requirements remain unverified.

## 23. HOW TO RESPOND WHILE BUILDING

Keep your responses concise and implementation-focused.

For each meaningful milestone, report:

1. What was implemented.
2. Important files created or changed.
3. Tests performed and their actual results.
4. Any manual setup still required.
5. The next concrete step.
6. Whether `PROJECT_MEMORY.md` has been updated.

Do not print entire files into the conversation when you can edit them directly in the repository.

When code must be delivered through the conversation, provide complete files with their paths and avoid unnecessary repetition.

Do not provide fake success messages, pretend integrations, or unverified deployment claims.

When a decision is not critical, choose a sensible default, document it, and continue. Ask me only when an unresolved decision genuinely blocks implementation or could cause significant rework.

## 24. START NOW

Begin by determining whether you have access to a filesystem, terminal, and Git repository.

If an existing repository is available:

1. Inspect its structure and Git status.
2. Read the existing README and `PROJECT_MEMORY.md`, if present.
3. Identify existing implementation, unfinished work, and potential conflicts.
4. Preserve working code and unrelated changes.

If no project exists, initialize it using the specified stack and conventions.

Then:

1. Create or update `PROJECT_MEMORY.md` immediately.
2. Create or update the README and essential configuration.
3. Establish the database schema and migrations.
4. Implement the foundation in the defined phases.
5. Keep the project memory log synchronized with the actual work.
6. Ensure each meaningful milestone leaves the project in a documented, resumable state.

Do not stop after producing a plan or folder tree. Begin implementing the application using the tools available to you.

If external credentials are unavailable, do not block the entire project. Complete the work that does not depend on them, document the missing configuration, and continue.

The final objective is a functional, secure, mobile-first, bilingual event management application with role-specific dashboards, hotel and bus management, coordinator-controlled live GPS tracking, persistent phone OTP authentication, and a maintainable GitHub repository.

The project must be resumable at any point by a different AI assistant using this same master prompt, the latest `PROJECT_MEMORY.md`, and the repository itself.
