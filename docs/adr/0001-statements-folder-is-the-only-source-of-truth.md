# The Statements folder is the only source of truth

The tracker rereads every Statement in the data folder each time it runs and keeps no database or cache of its own. With a few dozen Statements a full reread is fast, and it means there is nothing to fall out of sync: adding, replacing or deleting a Statement file is the whole workflow. The tool never writes to the data folder, with one exception: when you approve a Categorisation Rule on the page, it saves that rule to the rules file. Statements themselves are never modified.

## Considered Options

- An import step that copies each Statement into a local database once. Rejected because it creates a second copy of sensitive data and a sync problem, for a speed gain we don't need at this scale.
