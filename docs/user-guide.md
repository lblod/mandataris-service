# Mandataris Service User Guide

> **Status: skeleton.** This guide lists the service's actions and a short
> description of each. Request/response examples, screenshots, and detailed
> preconditions still need to be added.

## 1. Introduction

The Mandataris service applies the business rules for mandatees (mandatarissen)
of Flemish local governments to the triplestore. It supports the full mandate
lifecycle: creating, linking, correcting, ratifying, ending, importing, and
exporting mandatees.

### 1.1 Intended audience

This guide is for administrators and developers working with a Lokaal
Mandatenbeheer installation. It assumes familiarity with mandatees, municipal
councils, OCMW councils, factions, and appointment decisions.

### 1.2 Conventions

- All routes are relative to the service's base URL and are reached through the
  semantic.works dispatcher.
- Identifiers in URLs and request bodies are UUIDs unless stated otherwise.
- Most routes expect a valid `mu-session-id` header; authorization is applied by
  the service and by `mu-authorization`.
- Responses are JSON unless the action returns a CSV file.

## 2. Concepts

| Term | Meaning |
| --- | --- |
| Mandataris | A person holding a political mandate for a period. |
| Bestuursorgaan | The governing body in which the mandate is held (e.g. municipal council, OCMW council). |
| Bestuursperiode | The legislative term in which the mandate falls. |
| Fractie | A political group or faction within a governing body. |
| Bekrachtiging | Ratification of an appointment by a decision (`besluit`). |
| Linked mandate | The mirrored mandate between a municipality and its OCMW. |
| Installatievergadering | The inaugural meeting that establishes a new council. |

## 3. Table of contents

1. [Managing mandatees](#4-managing-mandatees)
2. [Managing persons](#5-managing-persons)
3. [Managing factions](#6-managing-factions)
4. [Linked mandatees (municipality and OCMW)](#7-linked-mandatees-municipality-and-ocmw)
5. [Ranking order (rangorde)](#8-ranking-order-rangorde)
6. [Appointing a mayor](#9-appointing-a-mayor)
7. [Installation meeting](#10-installation-meeting)
8. [Importing mandatees from CSV](#11-importing-mandatees-from-csv)
9. [Downloading election results](#12-downloading-election-results)
10. [Police zone synchronisation](#13-police-zone-synchronisation)
11. [URL validation](#14-url-validation)
12. [Background jobs and notifications](#15-background-jobs-and-notifications)
13. [Development-only mock actions](#16-development-only-mock-actions)
14. [Troubleshooting](#17-troubleshooting)
15. [Glossary](#18-glossary)

## 4. Managing mandatees

### 4.1 Generate draft mandatee rows

`POST /mandatarissen/generate-rows`

Generates a number of empty draft mandatees for a mandate and period, with an
automatically incrementing ranking order.

### 4.2 Copy data to another mandatee

`PUT /mandatarissen/:id/copy/:newId`

Copies non-resource-domain properties from an existing mandatee to a newly
created mandatee, so the new record starts from the previous data.

### 4.3 Download mandatees

`GET /mandatarissen/download`

Exports a filtered list of mandatees as a CSV file. Filters include bestuursperiode, bestuursorgaan, person, faction, function, and active status.

### 4.4 Delete a mandatee

`DELETE /mandatarissen/:id`

Deletes a mandatee by replacing it with a tombstone. Use `?withLinked=true` to
also delete the linked mandatee in the other government level.

### 4.5 Check mandatee ownership

`GET /mandatarissen/check-ownership?mandatarisIds=<id,id>`

Checks whether the current session has access to the supplied mandatees. Returns
an error when no mandatee IDs are provided.

### 4.6 Set publication status in bulk

`POST /mandatarissen/bulk-set-publication-status`

Sets the publication status of multiple mandatees to ratified or not ratified.
Ratifying requires a link to the decision (for example a `besluit` URI).

### 4.7 List factions of a mandatee

`GET /mandatarissen/:id/fracties`

Returns all factions a mandatee belonged to across its successive states.

## 5. Managing persons

### 5.1 Get the current faction of a person

`GET /personen/:id/bestuursperiode/:bestuursperiodeId/current-fractie`

Returns the faction the person is currently associated with in the given
legislative period.

### 5.2 Check for active mandates

`GET /personen/:id/has-active-mandates/:bestuursperiodeId`

Indicates whether the person has at least one active mandate in the given
legislative period.

### 5.3 End all active mandates

`PUT /personen/:id/end-active-mandates`

Ends all active mandatees of a person on a given date, recording a history entry
for the action.

### 5.4 Check whether a person belongs to a faction

`POST /personen/:persoonId/check-fraction`

Checks whether the person is a member of the supplied faction in the supplied
legislative period.

### 5.5 Place a person in the correct graph

`POST /personen/:persoonID/put-person-in-right-graph/:orgaanID`

Copies the person's data to the graph that owns the given governing body when
the person is not yet present there.

## 6. Managing factions

### 6.1 List independent factions

`GET /fracties/onafhankelijk/:bestuursperiodeId/bestuursperiode`

Returns the independent factions for a legislative period.

### 6.2 List cooperation factions

`GET /fracties/samenwerking/:bestuursperiodeId/bestuursperiode`

Returns the cooperation factions for a legislative period.

### 6.3 Update the current faction of a mandatee

`POST /fracties/:mandatarisId/current-fractie`

Synchronises the current faction on the person with the faction of the
mandatee's most recent membership.

### 6.4 Clean up empty factions

`DELETE /fracties/cleanup/bestuursperiode/:bestuursperiodeId`

Removes factions in a legislative period that no longer have any memberships.

### 6.5 Create a faction replacement

`POST /fracties/:fractieId/create-replacement`

Ends the current faction on a given date and creates a replacement with a new
label. The body contains `label` and `endDate`.

### 6.6 Delete a faction

`DELETE /fracties/:id`

Deletes a faction by replacing it with a tombstone.

## 7. Linked mandatees (municipality and OCMW)

### 7.1 Check for a possible duplicate mandate

`GET /mandatarissen/:id/check-possible-double`

Checks whether the mandatee already has a counterpart in the linked government
level and returns any existing link.

### 7.2 Create a linked mandatee

`POST /mandatarissen/:id/create-linked-mandataris`

Creates the mirrored OCMW or municipal mandatee, including the person, faction,
and replacement links.

### 7.3 Correct linked mandatee data

`POST /mandatarissen/:id/correct-linked-mandataris`

Repairs inconsistencies between a mandatee and its linked counterpart, such as
faction or person data.

### 7.4 Change the state of a linked mandatee

`POST /mandatarissen/:oldId/:newId/update-state-linked-mandataris`

Updates the linked mandatee when the source mandatee changes state, for example
when a replacement starts or ends.

### 7.5 Add a replacement to a linked mandatee

`POST /mandatarissen/:id/add-linked-replacement`

Adds replacement information to the linked mandatee in the other government
level.

### 7.6 Remove a link between mandatees

`DELETE /mandatarissen/:id/remove-link-linked-mandataris`

Removes the link between a mandatee and its counterpart without deleting either
mandatee.

## 8. Ranking order (rangorde)

### 8.1 Update ranking orders

`POST /rangorde/update-rangordes`

Updates the ranking order of the supplied mandatees and starts a new mandatee
state where needed. Use `?asCorrection=true` to correct the ranking in place.

## 9. Appointing a mayor

### 9.1 Process a mayor appointment or rejection

`POST /burgemeester-benoeming` (multipart form data)

Processes the appointment or rejection of a mayor based on a decision document.
Required fields include `bestuurseenheidUri`, `burgemeesterUri`, `status`, and
`datum`, plus the uploaded `file`.

## 10. Installation meeting

### 10.1 Copy municipal mandatees to the OCMW draft

`POST /installatievergadering-api/copy-gemeente-to-ocmw-draft`

Creates draft OCMW mandatees by copying the municipal mandatees, mapping each
municipal function to its OCMW equivalent.

### 10.2 Move OCMW organs to the real OCMW graph

`POST /installatievergadering-api/:id/move-ocmw-organs`

Moves factions, mandatees, memberships, and persons from an installation meeting
draft to the real OCMW graph and marks the meeting as processed.

## 11. Importing mandatees from CSV

### 11.1 Upload a CSV file

`POST /mandatarissen/upload-csv` (multipart form data, field `file`)

Imports mandatees from a CSV file for the municipality of the current session.
The response reports created persons, mandatees, policy domains, errors, and
warnings.

## 12. Downloading election results

### 12.1 Download election results

`GET /election-results-api/:id/download`

Downloads the results of a direct election as a CSV file. Returns 404 when the
election cannot be found.

## 13. Police zone synchronisation

### 13.1 Process police zone deltas

`POST /delta/politiezones`

Receives delta notifications and mirrors changed mandatees and persons into the
shared police zone graph.

### 13.2 Repair missed police zone changes

Runs automatically at startup.

Scans for changes that were missed while the service was down and mirrors them
into the police zone graph.

## 14. URL validation

### 14.1 Validate a URL

`GET /validate-url?link=<url>`

Checks whether a public HTTPS URL is reachable. Supports `follow=true` to follow
redirects and rejects private or internal hosts.

## 15. Background jobs and notifications

### 15.1 Automatically ratify mandatees with a decision

Runs every five minutes by default.

Finds mandatees that are still draft or not ratified but have a linked decision
and marks them as ratified.

### 15.2 Link municipality and OCMW mandatees automatically

Runs every four minutes by default.

Scans municipality and OCMW graph pairs and creates missing links between
corresponding mandatees.

### 15.3 Notify about active mandatees without a decision

Disabled unless `NOTIFICATION_CRON_PATTERN` is configured.

Creates system notifications, and optionally emails, for active mandatees that
have been unratified for more than ten days.

### 15.4 Clean up broken OCMW faction links

Runs every five minutes.

Repairs `org:memberOf` links on OCMW factions and removes links that point to
non-faction resources.

## 16. Development-only mock actions

> These routes exist for testing and must not be used in production.

### 16.1 Add a mock decision

`GET /mock/add-decision`

Creates a fake decision for a fixed mandatee to test the ratification flow.

### 16.2 Clear mock decisions

`GET /mock/clear-decisions`

Removes mock decisions and resets the affected mandatee's publication status.

## 17. Troubleshooting

- **Action returns 401 or 403:** check the `mu-session-id` header and the
  session's access to the bestuurseenheid.
- **Action returns 400:** verify that all identifiers exist and that required
  dates and labels are supplied.
- **CSV import reports errors:** check the row numbers in the response and the
  required column headers.
- **Data appears in the wrong graph:** verify the bestuurseenheid and
  bestuursorgaan identifiers and run the relevant linking or repair action.

## 18. Glossary

| Term | Definition |
| --- | --- |
| Besluit | An administrative decision that can ratify an appointment. |
| Bekrachtigd | Ratified; the appointment has a valid decision. |
| Niet bekrachtigd | Not ratified; the appointment still needs a decision. |
| Draft | A mandatee that has not yet been published or ratified. |
| Fractie | A political group within a council. |
| OCMW | Public Centre for Social Welfare. |
| Rangorde | The position of a mandatee on an electoral or appointment list. |
