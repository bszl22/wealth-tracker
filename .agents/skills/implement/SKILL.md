---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Start once you hold a ticket or spec that settles the interface and the seams to test. A ticket reference: fetch it as `docs/agents/issue-tracker.md` describes and state its title. An architecture candidate: read its `candidate-<N>.md` under `.scratch/architecture/`. For anything else, such as a candidate with no spec yet or an idea from chat, stop and send the user to `/grill-with-docs`; the design calls are theirs.

Call the Skill tool with "tdd" where possible, at the seams the ticket or spec names.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, call the Skill tool with "code-review" to review the work.

Commit your work to the current branch.
