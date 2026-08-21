# ChatGPT QA audit: Seating Chart, 2026-08-20

Plain-text conversion of Sky_Wolf_Studio_Seating_Chart_QA_Audit.docx (same folder),
extracted 2026-08-21 so future sessions can grep it without unzipping the docx.
ChatGPT saw only the live public page, not the source. Verification against
source lives in docs/HANDOFF-2026-08-21-OPUS.md.


SKY WOLF STUDIO
Seating Chart App
QA + Product Improvement Audit
Live app reviewed: https://skywolfstudio.com/seating-chart/
Prepared August 20, 2026  |  Coder-ready implementation and regression guide
Scope and honesty note
This audit combines (1) confirmed findings from the publicly accessible live page and its crawlable interface, (2) market-validated feature requests and failure patterns from current seating-chart users and competitors, and (3) a hostile regression test plan. The review environment cannot fully operate every JavaScript drag/drop, touch, canvas, export, or local-storage interaction. Items that were not directly reproduced are labeled as TEST REQUIRED or FEATURE GAP CANDIDATE rather than falsely reported as confirmed bugs.



1. Executive Summary
Bottom line: The app has a strong product premise: free, no account, no ads, no watermark, and local-device privacy. Its guest model already exposes useful event data such as party/group, meal, dietary flags, RSVP, table shape, seat count, and seating rules. The biggest opportunity is not cosmetic polish. It is making the tool extremely trustworthy under edits, easy to recover/backup, faster to populate, easier to experiment with, and more useful on event day.
Top implementation order
Priority
Item
Why it matters
Status
Coder action
P0
Protect user data and layout state
One silent loss, duplication, overwrite, or reappearing deletion destroys trust.
TEST REQUIRED
Add invariant checks, autosave status, backup/restore, destructive-action guards, and regression tests.
P0
Undo / redo + version snapshots
Users need to experiment without destroying a working arrangement.
FEATURE GAP CANDIDATE
Implement action history and duplicate-layout/version restore.
P0
Project backup / import
Local-only storage is private but fragile if browser/site data is cleared or a device changes.
FEATURE GAP CANDIDATE
Export/import a complete project JSON file with schema version.
P1
Fast guest import
Manual entry is painful for real weddings and large events.
FEATURE GAP CANDIDATE
Paste-list + CSV/XLSX import with mapping and duplicate detection.
P1
Relationship and constraint system
Seating is a constraint problem: keep together, keep apart, VIP, accessibility.
PARTIAL FOUNDATION
Upgrade group/rule fields into structured relationships with conflict warnings.
P1
Room / floor-plan tools
Users need venue context, not just tables.
FEATURE GAP CANDIDATE
Add room objects, floor-plan image background, rotation, alignment, scale.
P1
Search, filter, counts
Large lists become unusable without finding and balancing tools.
FEATURE GAP CANDIDATE
Add unseated filters, RSVP/group/meal filters, occupancy and totals.
P2
Export suite
Venues, caterers, guests, and planners need different views of the same data.
VERIFY CURRENT EXPORTS
Provide floor plan, table list, alphabetical list, caterer report, CSV/XLSX, print views.
P2
SEO / crawlable product content
The current indexed page is extremely thin and search engines see mostly modal form text.
CONFIRMED
Add static feature copy, use cases, FAQ, screenshots/alt text, structured metadata.
P3
QR seat finder / optional collaboration
Useful differentiators after reliability and workflow are solid.
ROADMAP
Add only after the core editor is boringly reliable.
What is already working in the product concept
Strong privacy promise: data stays on device; no account requirement.
Free positioning with no watermark and free exports is unusually clear.
Guest records already include party/group, meal, dietary flags, and RSVP.
Tables expose label, shape, and seat count.
A seating-rule concept already exists, which can become the app's strongest differentiator.
Multiple events are implied by the event-creation workflow.
2. Confirmed Findings From the Live Public Surface
These are findings that can be verified from the live page as exposed to the browser/search crawler on August 20, 2026.
C-01 - Crawlable page content is extremely thin
Severity: High   Status: CONFIRMED PUBLIC-SURFACE FINDING
Evidence: The indexed page exposes the title, privacy/free promise, footer links, and dialog/form fields, but almost no explanatory product content.
Why it matters: Organic search has little text explaining use cases, features, workflows, or why the tool is better than alternatives.
Coder action: Add 600-1,200 words of useful static content below the app: feature summary, how it works, wedding/classroom/event use cases, FAQ, privacy explanation, export types, guest/table limits, and mobile support.
C-02 - Modal/editing form text dominates the indexed content
Severity: Medium   Status: CONFIRMED PUBLIC-SURFACE FINDING
Evidence: Searchable content includes 'Edit guest', 'Edit table', and 'Add a rule' fields.
Why it matters: This may make search snippets less useful and indicates that hidden UI may be more crawler-visible than product marketing copy.
Coder action: Verify modal semantics. Hidden dialogs should be properly hidden from the accessibility tree when closed. Add meaningful static page copy so modal controls are not the primary indexed text.
C-03 - Dietary flags use semicolon-delimited free text
Severity: Medium   Status: CONFIRMED PUBLIC-SURFACE FINDING
Evidence: The live UI says 'Dietary flags (separate with ;)'.
Why it matters: This is functional but technical, error-prone, and difficult to summarize consistently for caterers.
Coder action: Replace or supplement with tag/chip entry. Normalize duplicates/casing and retain a free-form notes field.
C-04 - Party / group is a free-text field
Severity: Medium   Status: CONFIRMED PUBLIC-SURFACE FINDING
Evidence: The live guest editor exposes 'Party / group' as text.
Why it matters: Different spellings create accidental duplicate groups and the field cannot reliably drive group-level moves or constraints.
Coder action: Convert to structured group objects with autocomplete; allow multiple tags plus a primary party/household.
C-05 - Table editor exposes shape and seat count, but advanced seat geometry is not crawl-visible
Severity: Medium   Status: CONFIRMED PUBLIC-SURFACE FINDING
Evidence: The live table editor exposes Label, Shape, and Seats.
Why it matters: Real venues need nonuniform rectangular seating, rotations, head tables, combined banquet tables, and sometimes seat-side control.
Coder action: Confirm what is already supported. If absent, add per-side seat counts and free/15-degree rotation.
3. P0: Data Integrity and State Reliability
Definition of done
A user must be able to trust that a guest, seat, table, rule, or layout will never silently disappear, duplicate, reappear, overwrite another record, or move on its own. Competitor reviews show that these failures generate immediate one-star reviews even when the rest of the app is useful.

Required engineering safeguards
Use stable immutable IDs for guests, tables, seats, groups, rules, and events. Never key records by display name.
Make all state-changing operations atomic: update the intended record exactly once, then persist once.
Persist a schemaVersion with every saved project. Provide explicit migrations when data shape changes.
Keep a monotonic revision number or updatedAt timestamp at event/project level so stale copies do not overwrite newer state.
Debounce autosave, but flush pending changes on visibilitychange/pagehide where possible.
Write save failures to visible UI. Never imply 'saved' when persistence failed.
Before destructive operations, compute dependent consequences and show them to the user.
When table capacity decreases below occupancy, do not silently evict or rearrange guests.
When RSVP changes to declined, ask whether to unseat the guest; do not silently delete the guest.
Validate imported IDs and generate new local IDs on collision.
Use defensive parsing for corrupted/older local-storage data; preserve the raw backup before migration.
Add a recovery snapshot before imports, bulk deletes, auto-seat, and schema migrations.
Autosave and recovery UX
Show a small persistent state indicator: Saving... / Saved locally / Save failed.
Add 'Download backup' and 'Restore backup'.
Keep at least the last 5 local snapshots per event if storage allows.
Add a 'Recently deleted' or undoable soft-delete window for entire events.
Warn users that clearing browser/site data can remove local projects, and immediately offer backup download.
4. Hostile Regression Test Plan
The following tests should be run in automated unit/integration tests where practical, then repeated as manual browser/device smoke tests. A failure in any P0 test should block release.
ID
Pri
Test
Steps
Expected result
QA-001
P0
Guest identity survives edits
Create guest 'Barbara Smith'; seat her; edit name to 'Barbara O’Connor'.
Same guest ID remains seated in the same seat/table; no duplicate is created.
QA-002
P0
Duplicate name handling
Create two different guests both named 'John Smith'.
Both records remain independent and can be seated separately.
QA-003
P0
Rapid move race
Rapidly move one guest through five seats/tables.
Exactly one final assignment exists; no ghost/duplicate placements.
QA-004
P0
Delete occupied table
Delete a table containing guests.
User sees consequences; guests become intentionally unassigned or deletion is canceled. No guest record disappears.
QA-005
P0
Undo occupied-table deletion
Delete occupied table, then Undo.
Table, position, seat assignments, and guest links restore exactly.
QA-006
P0
Reduce capacity below occupancy
Change a 10-seat occupied table with 10 guests to 8 seats.
Blocking warning or explicit unseat choice. No silent rearrangement.
QA-007
P0
Increase capacity after reduction attempt
Cancel capacity reduction, then increase to 12.
Original assignments remain unchanged.
QA-008
P0
Delete guest from group
Delete one member of a household/couple.
Only intended guest is removed. Group links remain valid; no partner overwrite.
QA-009
P0
Plus-one / linked-person integrity
Link guest A with guest B, edit B, move A.
Names and IDs never overwrite each other.
QA-010
P0
Refresh during pending edit
Change a seated guest and immediately refresh.
Either saved state is recovered or UI clearly indicates unsaved data; no partial/corrupt state.
QA-011
P0
Close/reopen tab
Create event, tables, rules, guests; close tab; reopen.
State reloads identically.
QA-012
P0
Two tabs open
Open same event in two tabs and edit both.
App prevents stale overwrite, warns, or has a deterministic conflict strategy.
QA-013
P0
Corrupted local data
Modify stored project to contain missing/unknown optional field or malformed record in dev test fixture.
App fails safely, preserves recoverable records, and offers recovery/backup.
QA-014
P0
Schema migration
Load a fixture from each prior schema version.
Migration is deterministic and no assignments are lost.
QA-015
P0
Repeated delete/save/reload
Delete a table/object 20 times across create/save/reload cycles.
Deleted objects never reappear.
QA-016
P0
Bulk import duplicate rows
Import a CSV containing exact duplicate and same-name-different-person rows.
Importer flags potential duplicates without merging legitimate people automatically.
QA-017
P0
Special-character names
Use O'Connor, José Núñez, 王小明, emoji, hyphenated names.
Display, save, export, reload, and search preserve characters.
QA-018
P0
Very long text
Use 200-character guest name, dietary note, group name, event name.
No layout explosion, truncation without access to full text, or save crash.
QA-019
P0
Blank/whitespace records
Try empty name and whitespace-only name.
Validation blocks unusable records or creates a clearly labeled placeholder intentionally.
QA-020
P0
Numeric abuse on seat count
Try -1, 0, 2.5, 999999, letters, pasted spaces.
Input clamps/validates to supported integer range without crash.
QA-021
P0
Export/import round trip
Build complex event; export project; delete local state; import project.
Imported project is structurally identical: IDs, rules, positions, assignments, meals, dietary data, RSVPs.
QA-022
P1
Declined RSVP while seated
Change seated guest from attending to declined.
Prompt whether to unseat; record is retained; counts update correctly.
QA-023
P1
Search exact and partial
Search surname, first name, accented name, group, table.
Expected results appear quickly and consistently.
QA-024
P1
Filter counts reconcile
Filter unseated/attending/group/meal.
Visible totals reconcile with event totals; filters do not change data.
QA-025
P1
Drag on touch device
Assign guest via touch on iPad/Android tablet.
Long-press/drag is discoverable, stable, and does not scroll page unexpectedly.
QA-026
P1
Drag cancel
Start dragging a guest then release outside a valid target.
Guest returns to original location; no assignment is lost.
QA-027
P1
Table drag near canvas edge
Drag table to edges/corners.
No inaccessible/off-canvas stranded object; user can recover/select it.
QA-028
P1
Zoom and drag
Zoom browser/canvas, then move guest/table.
Coordinates remain correct; object does not jump.
QA-029
P1
Screen rotation
Rotate tablet/phone during editing.
Layout remains recoverable; no state reset or coordinate corruption.
QA-030
P1
Keyboard-only path
Create/edit guest and table without mouse.
Core forms work; focus order is logical; dialogs trap/restore focus correctly.
QA-031
P1
Escape/cancel semantics
Edit a record, change fields, press Cancel/Escape.
No unsaved changes leak into stored state.
QA-032
P1
Rule violation updates
Create keep-apart rule, seat pair together, then move one.
Violation appears/disappears immediately and never alters seating without consent.
QA-033
P1
Group move
Move a structured household as a group.
All intended members move exactly once; capacity/rules validate before commit.
QA-034
P1
Mixed table capacities
Create tables with 2, 6, 8, 10, 12 seats.
Occupancy display, drag targets, export, and layout all respect each capacity.
QA-035
P1
Rectangular side seating
Set custom seats per side.
Seat geometry matches explicit per-side counts and survives rotation/reload.
QA-036
P1
Arbitrary rotation
Rotate rectangular table 15/45/73 degrees if supported.
Visual and hitboxes rotate together; saved angle persists.
QA-037
P1
Large event performance
Load 250-500 guests and 30-60 tables.
Scrolling, filtering, drag, autosave, and export remain responsive; no runaway memory.
QA-038
P1
Offline behavior
Load app once, go offline, continue editing if offline support is intended.
Existing project remains editable or UI clearly explains required connectivity.
QA-039
P1
Storage quota failure
Simulate local storage/indexedDB quota failure.
Visible save error appears; user is told to download a backup; no false 'saved' indicator.
QA-040
P2
PDF print legibility
Export a dense 200-guest event in portrait and landscape.
No clipped names, missing tables, overlapping labels, or unreadably tiny text.
QA-041
P2
Alphabetical guest export
Export an alphabetical lookup list.
Every attending/seated guest appears exactly once with correct table.
QA-042
P2
Caterer report reconciliation
Export meals/dietary report.
Meal counts equal attending meal selections; dietary notes map to the correct person/table.
QA-043
P2
Browser zoom 200%
Use app at 200% zoom.
Controls remain reachable and text does not overlap.
QA-044
P2
Small viewport
Test narrow mobile width.
Dialogs fit viewport, keyboard does not permanently obscure save controls, horizontal overflow is controlled.
QA-045
P2
Reduced motion / high contrast
Use OS accessibility preferences.
Core interactions remain understandable without relying only on animation or color.
5. Product Gaps and Improvements
5.1 Undo / Redo and Version History
Priority: P0   Why: Users need freedom to experiment. A working arrangement should never feel fragile.
Add Undo and Redo buttons with keyboard shortcuts where appropriate.
Store at least 25-100 reversible actions.
Add 'Duplicate layout' or 'Save version'.
Offer restore points before bulk imports, auto-seat, and large deletes.
Evidence / rationale: Market evidence: current competitors promote version history; users describe rebuilding on paper/spreadsheets partly because moving names can create cascading problems.
5.2 Complete Project Backup / Restore
Priority: P0   Why: Local-only privacy is a strength, but browser storage is not a sufficient backup strategy.
Download one complete project file (e.g., .sws-seating.json).
Include schemaVersion, appVersion, project ID, timestamps, events, guests, groups, tables, seats, positions, rules, settings.
Import should validate structure and preview event count/guest count before replacing anything.
Never auto-overwrite current state on import without creating a recovery snapshot.
Evidence / rationale: This preserves the no-account promise while making the app portable and recoverable.
5.3 Paste List + CSV/XLSX Guest Import
Priority: P1   Why: Import is one of the strongest onboarding accelerators in the category.
Quick add: paste one name per line.
CSV import with column mapping.
Optional XLSX import.
Auto-detect common headers: name, party, RSVP, meal, dietary/allergy, notes.
Preview additions/updates/possible duplicates before commit.
Allow exports from Zola/The Knot/Joy/Eventbrite to be mapped easily.
Evidence / rationale: Current seating products use import as a core acquisition pitch; Reddit users explicitly value spreadsheet import.
5.4 Structured Groups, Couples, Households and Tags
Priority: P1   Why: Free-text 'Party / group' is not enough for powerful seating behavior.
Create stable group IDs and display names.
Support household/couple/party as a primary relationship.
Support additional tags such as Bride family, Groom family, College friends, Work, Kids.
Group drag should be optional and capacity-aware.
Allow 'keep together' to target a group rather than repeating pair rules.
Evidence / rationale: Competitor users have complained when tools force person-by-person movement instead of couple/family movement.
5.5 Constraint / Rule Engine
Priority: P1   Why: This can become Sky Wolf Studio's most defensible feature because seating is fundamentally a constraint problem.
Keep together / same table.
Keep apart / different tables / not adjacent.
Near VIP/head table.
Away from speakers/bar.
Near exit / accessible route.
Wheelchair space / high chair / child seat.
Lock guest to seat/table.
Show warnings, never auto-move without explicit auto-seat action.
Provide a conflict summary panel: 3 rule violations, click to jump.
Evidence / rationale: Current 2026 products increasingly market conflict highlighting and rule-based auto-seating.
5.6 Table-Only vs Specific-Seat Mode
Priority: P1   Why: Many events only assign tables. Forcing exact seats adds unnecessary work.
At event creation ask: Assign tables only / Assign specific seats.
Table-only mode should show guest lists within tables rather than chair positions.
Allow switching to seat-level later without losing table assignments.
Evidence / rationale: Current wedding-planning discussions explicitly distinguish table assignment from exact seat assignment.
5.7 Advanced Table Geometry
Priority: P1   Why: Real venues use mixed capacities and nonuniform banquet layouts.
Round, square, rectangle, oval, head table, sweetheart, chair rows.
Per-side seat counts for rectangles.
Any supported seat count within a sane limit.
Arbitrary rotation or at least 15-degree increments.
Visual capacity badge: 8/10.
Optional physical dimensions and units for professional planners.
Evidence / rationale: App Store reviews specifically complain about fixed rotation, seat-side placement, and lack of measurements.
5.8 Venue / Floor-Plan Objects
Priority: P1   Why: A seating chart is more useful when it represents the room.
Dance floor, DJ, stage/band, bar, buffet, cake/gift tables, photo booth, entrance/exit, restroom, pillars, walls, windows, lounge/couches.
Objects should support move, resize, rotate, label, lock, duplicate, and layer order.
Add alignment/distribution guides and snap-to-grid toggle.
Evidence / rationale: WeddingWire and Seat Puzzle promote room objects as core floor-plan features.
5.9 Floor-Plan Background Upload
Priority: P1   Why: Users often already have a venue diagram.
Upload JPG/PNG first; add PDF later.
Opacity slider, crop/fit, scale, rotate, lock.
Optional calibration: draw a known distance and enter feet/meters.
Do not require AI for the first version.
Evidence / rationale: A 2026 Reddit tester specifically requested uploading an existing floor plan to scale.
5.10 Search, Filters and Live Counts
Priority: P1   Why: Large guest lists need a command center rather than a long scroll.
Search name, group, table, meal, dietary note.
Filters: unseated, seated, attending, maybe, declined, no response, group, meal, dietary flag.
Live summary: Invited / Attending / Seated / Unseated / Open seats.
Per-table occupancy: 8/10.
Add 'show only conflicts'.
Evidence / rationale: Guest-list tools emphasize search and synchronization because manual scanning becomes painful at scale.
5.11 Dietary / Meal Data as Structured Data
Priority: P1   Why: The existing meal and dietary fields are valuable, but need safer input and useful outputs.
Dietary tags/chips with normalized labels.
Separate allergies from preferences/notes if desired.
Caterer summary by meal count.
Caterer report by table and guest.
Optional severe-allergy visual marker that does not expose details in guest-facing outputs.
Evidence / rationale: Current competitors explicitly advertise dietary tracking and catering exports.
5.12 Exports for Different Audiences
Priority: P2   Why: A single floor-plan image is not enough for planners, caterers, venue staff, and guests.
Visual PDF floor plan.
Table-by-table list.
Alphabetical guest lookup list.
CSV/XLSX.
Caterer meal/dietary report.
Printable place/escort cards if feasible.
High-resolution PNG.
Export options should include/exclude private notes and dietary details.
Evidence / rationale: WeddingWire and newer tools advertise print/email/export; current planners cite CSV exports for catering and escort cards.
5.13 QR Seat Finder
Priority: P3   Why: Useful event-day feature after the editor is stable.
Generate guest-facing QR page.
Guest searches their own name; result shows table and optionally highlighted map.
Do not expose full guest list or private notes.
Consider local static export or privacy-preserving hosted mode.
Evidence / rationale: Newer tools market QR seat finding and wallet passes as event-day workflow improvements.
5.14 Optional Collaboration
Priority: P3   Why: Collaboration is useful, but it should not destroy the local-first privacy identity.
Keep local-only default.
Short-term option: share project file.
Later: opt-in encrypted/private live link or collaborator mode.
Clearly disclose when data leaves the device.
Evidence / rationale: Real-time collaboration is a competitive feature, especially for planners and couples working together.
6. UX, Mobile and Accessibility Requirements
Area
Requirement
Discoverability
Every important gesture must also have an obvious visible control. Do not hide rotation, resizing, or seat editing behind undocumented multi-touch gestures.
Touch targets
Use at least approximately 44x44 CSS px for primary touch controls where practical; avoid tiny chair hit targets without magnification/selection aids.
Drag alternative
Every drag action should have a non-drag alternative: select guest -> Assign to table/seat.
Dialogs
Use semantic dialog roles, visible labels, Escape to close where safe, focus trap while open, and restore focus to the invoking control.
Keyboard
Forms, guest selection, assignment controls, and table editing should be usable without a mouse.
Color
Do not communicate RSVP, conflicts, or dietary warnings by color alone. Add text/icon/state labels.
Responsive layout
On phones/tablets, avoid the on-screen keyboard covering Save/Cancel. Keep critical controls sticky or scrollable into view.
Error messaging
Errors should say what happened and what the user can do next. Never fail silently.
Onboarding
Provide a 30-60 second first-run walkthrough or a compact 'How it works' panel. Competitor reviews explicitly ask for basic instructions.
Autosave reassurance
A visible 'Saved locally' indicator reduces panic when reopening a large project.
7. SEO and Public Page Improvements
This is a confirmed opportunity. The current crawlable page is only a few dozen lines and gives search engines very little context beyond the title/privacy promise and form controls.
Add a static H1 such as 'Free Seating Chart Maker for Weddings, Events and Classrooms'.
Add a 2-3 sentence product description above or below the app without blocking immediate use.
Add crawlable feature sections: guest import, drag/drop, table types, rules, RSVP/meal/dietary tracking, exports, privacy.
Add use-case copy for weddings, receptions, classrooms, corporate dinners, galas, parties, banquets, and event planners.
Add an FAQ with real questions: Is it free? Do I need an account? Where is data stored? Can I export? Can I back up? Does it work on phones/tablets? Is there a guest/table limit?
Add descriptive screenshots with useful alt text.
Use SoftwareApplication/WebApplication structured data if appropriate.
Add Open Graph/social preview title, description, and image.
Create internal links from Sky Wolf Studio's app directory and relevant tool pages.
Do not make hidden dialog text the most descriptive crawlable content on the page.
8. Recommended Implementation Sequence
Phase A - Make it impossible to lose trust
[ ] Automated state invariants and P0 regression suite.
[ ] Stable IDs and schema versioning.
[ ] Autosave status and error handling.
[ ] Project backup/import.
[ ] Undo/redo.
[ ] Safe destructive actions and capacity changes.
Phase B - Make real guest lists fast
[ ] Paste-list and CSV import.
[ ] Structured groups/couples/households.
[ ] Search, filters, occupancy totals.
[ ] Structured dietary tags and meal summaries.
[ ] Table-only seating mode.
Phase C - Make the room real
[ ] Mixed table geometry and per-side seats.
[ ] Rotation and alignment tools.
[ ] Venue objects.
[ ] Floor-plan background upload and scale calibration.
Phase D - Make outputs genuinely useful
[ ] Robust PDF/PNG export.
[ ] Alphabetical guest list.
[ ] Table-by-table list.
[ ] Caterer report.
[ ] CSV/XLSX export.
[ ] Private/public export toggles.
Phase E - Differentiators
[ ] Constraint summary and auto-seat remaining guests.
[ ] QR seat finder.
[ ] Optional collaboration.
[ ] Reusable venue templates for professional planners.
9. Release Acceptance Criteria
[ ] All P0 tests QA-001 through QA-021 pass.
[ ] No operation can create more than one active seat assignment for a single guest unless the data model explicitly supports multi-event assignments.
[ ] No deletion can reappear after reload unless the user restores it.
[ ] No guest name edit changes another guest's record.
[ ] No table-capacity edit silently removes or relocates a seated guest.
[ ] Project export/import round trip preserves all supported state.
[ ] Save failure is visible and actionable.
[ ] At 200+ guests, search/filter and core drag operations remain acceptably responsive on current mainstream desktop and mobile browsers.
[ ] PDF/print output has no clipped tables/names on supported sizes.
[ ] Mobile dialogs remain usable with the keyboard open.
[ ] Keyboard-only user can create/edit/assign without being trapped.
[ ] Closed dialogs are not exposed as active controls to assistive technology.
[ ] Static product page content is indexable and accurately describes the live feature set.
10. Current User/Market Evidence Used in This Audit
These sources are not treated as specifications. They are evidence of recurring user expectations, frustrations, and competitive features.
S1. Sky Wolf Studio Seating Chart live page
Verified live public fields and current privacy/free positioning.
https://skywolfstudio.com/seating-chart/
S2. Wedding Seating Chart Planner / Seat Puzzle - App Store reviews
Recent complaints about deleted objects reappearing, rearrangement, duplicate guests, plus-one overwrites, rotation/seat customization, instructions, and load-time panic.
https://apps.apple.com/us/app/wedding-seating-chart-planner/id1080012173?see-all=reviews
S3. Wedding Seating Chart Planner - App Store version history
2026 fixes specifically addressing duplicate chairs/tables/guest names, deleted items reappearing, sync issues, conflicts, and recently deleted recovery.
https://apps.apple.com/us/app/wedding-seating-chart-planner/id1080012173
S4. WeddingWire Seating Chart
Current mainstream expectations: custom floor plan, guest grouping, multiple events, chart/list view, room objects, drag/drop seating, print/export/email.
https://www.weddingwire.com/wedding-planning/wedding-seating-tables.html
S5. SeatPlan.io
Current competitive features: CSV import, dietary data, PDF/Excel export, floor-plan import, version history, collaboration, QR finder, venue templates.
https://seatplan.io/
S6. Reddit - free seating chart maker feedback (April 2026)
Direct user requests for varying table sizes, reliable iPad drag/drop, rotation, and uploading an existing floor plan to scale.
https://www.reddit.com/r/Weddingsunder10k/comments/1sp85us/0k_i_couldnt_find_a_good_app_to_build_my_seating/
S7. Reddit - large wedding table assignments (June 2026)
Users value custom floor plans, spreadsheet import, drag/drop, CSV export, and table-first planning before exact seats.
https://www.reddit.com/r/BigBudgetBrides/comments/1uggsu6/table_assignments_at_reception_for_large_wedding/
S8. Reddit - Seatbee / rule-based seating discussions (2026)
Market movement toward rule-based seating, common-platform CSV imports, multiple table shapes, floor-plan backgrounds, and PDF export.
https://www.reddit.com/r/iosapps/comments/1vaetun/i_made_an_ios_app_that_builds_your_wedding/
S9. Reddit - seating chart workflow discussion (February 2026)
Users still fall back to Google Sheets/Photoshop because they are easy to rebalance and visually manipulate.
https://www.reddit.com/r/weddingplanning/comments/1qv5u5p/how_are_you_handling_your_seating_chart/
11. Specific Failure Patterns to Guard Against
Deleted objects reappear after reload/sync: Treat deletion as a persistent state transition with stable ID tombstone/soft-delete or verified hard-delete, then test save/reload repeatedly.
Duplicate guests/chairs/tables: Prevent double-dispatch and stale-state merges; assert uniqueness by IDs after every reducer/state mutation in development builds.
Plus-one overwrites original guest: Never model linked people by positional array index or shared display-name key; use independent records and relationship IDs.
Layout moves without user action: Separate visual auto-layout from manual coordinates. Never recompute positions on unrelated guest edits or seat-count changes unless explicitly requested.
Users think data is gone while loading: Show a real loading state and don't render a blank/new project shell before stored data has finished loading.
Rotation/resize exists but users cannot discover it: Visible buttons and numeric controls must supplement gestures.
iPad drag is unreliable: Use Pointer Events/touch-action carefully; test long-press vs scroll conflict; provide tap-to-assign alternative.
People fear experimenting: Undo, duplicate layout, and version snapshots turn experimentation into a safe behavior.
12. Suggested Data Model Guardrails
This is not a required rewrite. It is a reference for avoiding the class of bugs repeatedly seen in seating apps.
Entity
Recommended fields
Project
id, schemaVersion, appVersion, createdAt, updatedAt, settings, events[]
Event
id, projectId, name, seatingMode, guests[], groups[], tables[], objects[], rules[], snapshots[]
Guest
id, eventId, name, primaryGroupId?, tagIds[], rsvp, mealId?, dietaryTags[], notes?
Group
id, eventId, name, type, memberGuestIds[]
Table
id, eventId, label, shape, capacity, x, y, rotation, dimensions?, seatLayout?
Seat
id, tableId, index/label, x/y or side/index, guestId?
Rule
id, eventId, type, subjectIds[], targetIds?, parameters, enabled
RoomObject
id, eventId, type, label, x, y, width, height, rotation, locked, layer
Snapshot
id, eventId, createdAt, reason, stateHash/version, serializedState or diff
State invariants worth asserting in development
Every active guest ID is unique within an event.
Every active table ID is unique within an event.
A seat references either zero or one valid guest ID.
In specific-seat mode, one guest cannot occupy two seats within the same event.
A table cannot have more assigned guests than capacity unless overbooking is explicitly supported and visibly flagged.
Every group member ID references a valid guest.
Every rule subject/target references valid IDs or is marked unresolved.
Every guest assignment references a valid table/seat.
Deleting a table removes/reassigns only assignment links, never guest records.
Import/migration ends with a full invariant validation before replacing current working state.
13. Final Coder Handoff Checklist
Done
Priority
Task
[ ]
P0
Add/verify stable IDs and schemaVersion.
[ ]
P0
Build state-invariant validation and automated tests.
[ ]
P0
Add visible autosave status and save-failure handling.
[ ]
P0
Add complete project backup/import with round-trip test.
[ ]
P0
Add undo/redo and recovery snapshots.
[ ]
P0
Guard destructive actions and table-capacity reductions.
[ ]
P0
Run QA-001 through QA-021 before release.
[ ]
P1
Add paste-list + CSV import with preview/mapping/duplicate detection.
[ ]
P1
Replace free-text-only groups with structured groups + optional tags.
[ ]
P1
Expand rules into keep together/apart, location, accessibility, lock, conflict summary.
[ ]
P1
Add table-only seating mode.
[ ]
P1
Add search, filters, occupancy counts, unseated count.
[ ]
P1
Add/verify mixed capacities, rectangular per-side seats, rotation.
[ ]
P1
Add venue objects and floor-plan background upload.
[ ]
P1
Improve dietary input to structured tags and caterer summaries.
[ ]
P2
Add/verify PDF, PNG, table list, alphabetical list, caterer, CSV/XLSX exports.
[ ]
P2
Complete keyboard/touch/accessibility pass.
[ ]
P2
Add crawlable feature/use-case/FAQ content and metadata.
[ ]
P3
Consider QR seat finder.
[ ]
P3
Consider optional collaboration and reusable venue templates.
