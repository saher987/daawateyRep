# migrations

Placeholder. This directory will hold relational database schema/migration scripts
**if and when** we decide to use Cloud SQL (Postgres) instead of Firestore — that
decision is deferred until after login (Milestone 1) and CI/CD (Milestone 2) are done.

These scripts are written to be run manually against Cloud SQL by you (e.g. via
`psql` or a migration tool). Nothing here is auto-applied on deploy.
